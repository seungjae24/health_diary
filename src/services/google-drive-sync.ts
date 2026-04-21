import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER_NAME = 'HealthDiary';
const IMAGES_FOLDER_NAME = 'images';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface GoogleUser {
    id: string;
    name: string;
    email: string;
    photo?: string;
}

export class AuthExpiredError extends Error {
    constructor() {
        super('AUTH_EXPIRED');
    }
}

export class GoogleDriveService {
    private accessToken: string | null = null;

    setAccessToken(token: string) {
        this.accessToken = token;
    }

    private get headers() {
        return { Authorization: `Bearer ${this.accessToken}` };
    }

    private async fetchJson(url: string, options?: RequestInit): Promise<any> {
        const res = await fetch(url, {
            ...options,
            headers: { ...this.headers, ...(options?.headers as any) },
        });
        if (res.status === 401) throw new AuthExpiredError();
        return res.json();
    }

    private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
        const parentQuery = parentId ? ` and '${parentId}' in parents` : '';
        const searchData = await this.fetchJson(
            `${DRIVE_API}/files?q=name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}&fields=files(id)`
        );

        if (searchData.files?.length > 0) {
            return searchData.files[0].id as string;
        }

        const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];

        const folder = await this.fetchJson(`${DRIVE_API}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return folder.id as string;
    }

    async getOrCreateAppFolder(): Promise<string> {
        return this.getOrCreateFolder(APP_FOLDER_NAME);
    }

    private async getOrCreateImagesFolder(): Promise<string> {
        const appFolderId = await this.getOrCreateAppFolder();
        return this.getOrCreateFolder(IMAGES_FOLDER_NAME, appFolderId);
    }

    private async findFileInFolder(folderId: string, fileName: string): Promise<string | null> {
        const data = await this.fetchJson(
            `${DRIVE_API}/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id)`
        );
        return data.files?.[0]?.id ?? null;
    }

    async findAppDataFile(fileName: string): Promise<string | null> {
        const folderId = await this.getOrCreateAppFolder();
        return this.findFileInFolder(folderId, fileName);
    }

    async uploadFile(fileName: string, content: string, fileId?: string): Promise<string> {
        const folderId = await this.getOrCreateAppFolder();

        const metadata = fileId
            ? { name: fileName }
            : { name: fileName, parents: [folderId] };

        const boundary = 'health_diary_boundary';
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: application/json',
            '',
            content,
            `--${boundary}--`,
        ].join('\r\n');

        const url = fileId
            ? `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=multipart`
            : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;

        const data = await this.fetchJson(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body,
        });
        return data.id as string;
    }

    async uploadImage(recordId: string, base64: string): Promise<void> {
        const imagesFolderId = await this.getOrCreateImagesFolder();
        const fileName = `${recordId}.b64`;
        const existingId = await this.findFileInFolder(imagesFolderId, fileName);

        const metadata = existingId
            ? { name: fileName }
            : { name: fileName, parents: [imagesFolderId] };

        const boundary = 'health_diary_boundary';
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: text/plain',
            '',
            base64,
            `--${boundary}--`,
        ].join('\r\n');

        const url = existingId
            ? `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=multipart`
            : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;

        await this.fetchJson(url, {
            method: existingId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body,
        });
    }

    async downloadImage(recordId: string): Promise<string | null> {
        const imagesFolderId = await this.getOrCreateImagesFolder();
        const fileId = await this.findFileInFolder(imagesFolderId, `${recordId}.b64`);
        if (!fileId) return null;

        const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
            headers: this.headers,
        });
        if (res.status === 401) throw new AuthExpiredError();
        return res.text();
    }

    async downloadFile(fileId: string): Promise<string> {
        const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
            headers: this.headers,
        });
        if (res.status === 401) throw new AuthExpiredError();
        return res.text();
    }

    async getUserInfo(): Promise<GoogleUser> {
        return this.fetchJson('https://www.googleapis.com/oauth2/v2/userinfo');
    }
}

export const googleDriveService = new GoogleDriveService();
