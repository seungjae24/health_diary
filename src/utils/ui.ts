import { Alert, Platform } from 'react-native';

/**
 * A cross-platform way to show a confirmation dialog.
 * Uses window.confirm on Web and Alert.alert on Mobile.
 */
export function confirmAction(
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText: string = '삭제'
) {
    if (Platform.OS === 'web') {
        const confirmDialog = globalThis.confirm;
        const confirmed = typeof confirmDialog === 'function'
            ? confirmDialog(`${title}\n\n${message}`)
            : true;
        if (confirmed) {
            onConfirm();
        }
    } else {
        Alert.alert(title, message, [
            { text: '취소', style: 'cancel' },
            { text: confirmText, style: 'destructive', onPress: onConfirm },
        ]);
    }
}
