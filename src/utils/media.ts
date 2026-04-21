import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { makeId } from './format';

async function ensurePermission(
  permissionRequest: () => Promise<ImagePicker.CameraPermissionResponse>,
  deniedMessage: string,
) {
  const permission = await permissionRequest();

  if (!permission.granted) {
    Alert.alert('Permission needed', deniedMessage);
    return false;
  }

  return true;
}

export type ImageSelectionResult = {
  uri: string;
  base64?: string;
};

export async function getPersistedImageUri(selection: ImageSelectionResult): Promise<string> {
  const uri = selection.uri;
  try {
    const filename = `${makeId('img')}.jpg`;
    const dest = `${(FileSystem as any).documentDirectory}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (error) {
    console.error('Failed to persist image:', error);
    return uri;
  }
}

export async function pickImageFromLibrary(allowMultiple = false): Promise<ImageSelectionResult[] | undefined> {
  const granted = await ensurePermission(
    ImagePicker.requestMediaLibraryPermissionsAsync,
    'Allow photo library access to attach meal and workout images.',
  );

  if (!granted) {
    return undefined;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !allowMultiple,
    allowsMultipleSelection: allowMultiple,
    aspect: [4, 4],
    quality: 0.75,
    base64: true,
  });

  if (result.canceled) {
    return undefined;
  }

  return result.assets.map(asset => ({
    uri: asset.uri,
    base64: asset.base64 || undefined,
  }));
}

export async function captureImageWithCamera(): Promise<ImageSelectionResult[] | undefined> {
  const granted = await ensurePermission(
    ImagePicker.requestCameraPermissionsAsync,
    'Allow camera access to capture meal and workout photos.',
  );

  if (!granted) {
    return undefined;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 4],
    quality: 0.75,
    cameraType: ImagePicker.CameraType.back,
    base64: true,
  });

  if (result.canceled) {
    return undefined;
  }

  return [{
    uri: result.assets[0].uri,
    base64: result.assets[0].base64 || undefined,
  }];
}
