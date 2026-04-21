import React, { createContext, useContext, useState, useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { makeRedirectUri } from 'expo-auth-session';

const isExpoGo = Constants.appOwnership === 'expo';
import { googleDriveService, GoogleUser, SyncStatus, AuthExpiredError } from '../services/google-drive-sync';
import { CLOUD_CONFIG } from '../config/cloud';
import { Alert, Platform } from 'react-native';
import { useHealthData } from './health-data-context';
import { getPersistentItem, removePersistentItem, setPersistentItem } from '../services/storage';

function showAlert(title: string, message: string) {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n${message}`);
    } else {
        Alert.alert(title, message);
    }
}

async function getSecureItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return getPersistentItem(key);
    return SecureStore.getItemAsync(key);
}

async function setSecureItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return setPersistentItem(key, value);
    return SecureStore.setItemAsync(key, value);
}

async function removeSecureItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return removePersistentItem(key);
    return SecureStore.deleteItemAsync(key);
}

WebBrowser.maybeCompleteAuthSession();

type SyncContextValue = {
    user: GoogleUser | null;
    status: SyncStatus;
    login: () => Promise<void>;
    logout: () => void;
    backup: () => Promise<void>;
    restore: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | undefined>(undefined);
const SYNC_AUTH_STORAGE_KEY = 'health-tracker-google-auth-v1';

type PersistedSyncAuth = {
    accessToken: string;
    user: GoogleUser;
};

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { store } = useHealthData();
    const [user, setUser] = useState<GoogleUser | null>(null);
    const [status, setStatus] = useState<SyncStatus>('idle');

    // expo-auth-session uses a browser-based OAuth flow (not the native Google SDK).
    // Android-type OAuth clients reject browser-based PKCE flows (401 invalid_client).
    // Using the Web Client ID on all platforms resolves this.
    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId: CLOUD_CONFIG.webClientId,
        androidClientId: CLOUD_CONFIG.webClientId,
        iosClientId: CLOUD_CONFIG.webClientId,
        scopes: ['https://www.googleapis.com/auth/drive', 'profile', 'email'],
        responseType: 'token',
        redirectUri: makeRedirectUri({
            native: 'https://auth.expo.io/@seungjae24/health-diary',
        } as any),
    });

    useEffect(() => {
        let mounted = true;

        async function hydrateSyncAuth() {
            try {
                const raw = await getSecureItem(SYNC_AUTH_STORAGE_KEY);
                if (!raw || !mounted) {
                    return;
                }

                const persisted = JSON.parse(raw) as PersistedSyncAuth;
                if (!persisted.accessToken || !persisted.user) {
                    await removeSecureItem(SYNC_AUTH_STORAGE_KEY);
                    return;
                }

                googleDriveService.setAccessToken(persisted.accessToken);
                setUser(persisted.user);
                setStatus('synced');
            } catch (error) {
                await removeSecureItem(SYNC_AUTH_STORAGE_KEY).catch(() => undefined);
            }
        }

        hydrateSyncAuth();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (response?.type === 'success') {
            const { authentication } = response;
            if (authentication?.accessToken) {
                handlePostLogin(authentication.accessToken);
            }
        }
    }, [response]);

    async function handlePostLogin(token: string) {
        try {
            setStatus('syncing');
            googleDriveService.setAccessToken(token);
            const userInfo = await googleDriveService.getUserInfo();
            setUser(userInfo);
            await setSecureItem(
                SYNC_AUTH_STORAGE_KEY,
                JSON.stringify({ accessToken: token, user: userInfo } satisfies PersistedSyncAuth)
            );
            setStatus('synced');
        } catch (error) {
            setStatus('error');
            if (__DEV__) console.error('Login error:', error);
        }
    }

    function handleAuthExpired() {
        logout();
        showAlert('다시 로그인 필요', 'Google 연동을 다시 해주세요. 기존 로그인이 만료되었습니다.');
    }

    async function backup() {
        if (!user) return;
        try {
            setStatus('syncing');

            // 이미지 추출: data URI → base64, Drive에 개별 파일로 업로드
            const imageRecords = [
                ...store.meals.filter(m => m.imageUri?.startsWith('data:image/')).map(m => ({ id: m.id, imageUri: m.imageUri! })),
                ...store.workouts.filter(w => w.imageUri?.startsWith('data:image/')).map(w => ({ id: w.id, imageUri: w.imageUri! })),
            ];
            for (const record of imageRecords) {
                const base64 = record.imageUri.split(',')[1];
                await googleDriveService.uploadImage(record.id, base64);
            }

            // 이미지 URI를 Drive 참조로 교체한 메타데이터 JSON 업로드
            const storeForBackup = {
                ...store,
                meals: store.meals.map(m => ({
                    ...m,
                    imageUri: m.imageUri?.startsWith('data:image/') ? `drive-image:${m.id}` : m.imageUri,
                })),
                workouts: store.workouts.map(w => ({
                    ...w,
                    imageUri: w.imageUri?.startsWith('data:image/') ? `drive-image:${w.id}` : w.imageUri,
                })),
            };

            const fileId = await googleDriveService.findAppDataFile('health-data.json');
            await googleDriveService.uploadFile('health-data.json', JSON.stringify(storeForBackup), fileId || undefined);
            setStatus('synced');
            showAlert('백업 완료', `Google Drive에 저장되었습니다. (사진 ${imageRecords.length}장 포함)`);
        } catch (error) {
            if (error instanceof AuthExpiredError) { handleAuthExpired(); return; }
            setStatus('error');
            showAlert('백업 실패', '잠시 후 다시 시도해 주세요.');
        }
    }

    async function restore() {
        if (!user) return;
        try {
            setStatus('syncing');
            const fileId = await googleDriveService.findAppDataFile('health-data.json');
            if (!fileId) {
                showAlert('백업 없음', 'Google Drive에 저장된 백업이 없습니다.');
                setStatus('synced');
                return;
            }

            const content = await googleDriveService.downloadFile(fileId);
            const storeData = JSON.parse(content);

            // Drive 참조를 실제 이미지 data URI로 복원
            const restoreImageUri = async (imageUri?: string): Promise<string | undefined> => {
                if (!imageUri?.startsWith('drive-image:')) return imageUri;
                const recordId = imageUri.slice('drive-image:'.length);
                const base64 = await googleDriveService.downloadImage(recordId);
                return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
            };

            const meals = await Promise.all(
                storeData.meals.map(async (m: any) => ({ ...m, imageUri: await restoreImageUri(m.imageUri) }))
            );
            const workouts = await Promise.all(
                storeData.workouts.map(async (w: any) => ({ ...w, imageUri: await restoreImageUri(w.imageUri) }))
            );

            await setPersistentItem('health-tracker-state-v1', JSON.stringify({ ...storeData, meals, workouts }));
            setStatus('synced');
            showAlert('복구 완료', '데이터가 복구되었습니다. 앱을 재시작해 주세요.');
        } catch (error) {
            if (error instanceof AuthExpiredError) { handleAuthExpired(); return; }
            setStatus('error');
            showAlert('복구 실패', '잠시 후 다시 시도해 주세요.');
        }
    }

    const logout = () => {
        googleDriveService.setAccessToken('');
        setUser(null);
        setStatus('idle');
        removeSecureItem(SYNC_AUTH_STORAGE_KEY).catch(() => undefined);
    };

    const value = {
        user,
        status,
        login: async () => {
            await promptAsync();
        },
        logout,
        backup,
        restore,
    };

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSync must be used within SyncProvider');
    }
    return context;
}
