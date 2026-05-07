import { Feather } from '@expo/vector-icons';
import React, { ComponentProps } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontFamily, palette, shadow } from '../theme';

type IconName = ComponentProps<typeof Feather>['name'];

export function SurfaceCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surfaceCard, style]}>{children}</View>;
}

export function ProgressBar({
  value,
  color = palette.mint,
}: {
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.min(100, Math.max(6, value * 100))}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function MetricPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warm';
}) {
  return (
    <View
      style={[
        styles.metricPill,
        tone === 'good' && styles.metricPillGood,
        tone === 'warm' && styles.metricPillWarm,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  size = 'md',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  size?: 'md' | 'sm';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choiceChip, size === 'sm' && styles.choiceChipSmall, selected && styles.choiceChipSelected]}
    >
      <Text style={[styles.choiceChipText, size === 'sm' && styles.choiceChipTextSmall, selected && styles.choiceChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  variant = 'solid',
  disabled = false,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'solid' | 'outline' | 'ghost';
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSmall,
        variant === 'solid' && styles.buttonSolid,
        variant === 'outline' && styles.buttonOutline,
        variant === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={size === 'sm' ? 14 : 16}
          color={variant === 'solid' ? (disabled ? '#E0E8E1' : palette.paper) : (disabled ? '#B0B8B1' : palette.ink)}
          style={[styles.buttonIcon, size === 'sm' && styles.buttonIconSmall]}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          size === 'sm' && styles.buttonTextSmall,
          variant !== 'solid' && styles.buttonTextDark,
          disabled && styles.buttonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FieldInput({
  label,
  hint,
  style,
  ...inputProps
}: TextInputProps & {
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <TextInput
        placeholderTextColor="#8C978D"
        style={[styles.input, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SurfaceCard style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <View style={styles.emptyAction}>
          <PrimaryButton label={actionLabel} onPress={onAction} variant="outline" />
        </View>
      ) : null}
    </SurfaceCard>
  );
}

export function ModalSheet({
  visible,
  title,
  subtitle,
  onClose,
  onSave,
  saveLabel = '저장',
  saveDisabled = false,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheetWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeading}>
                <Text style={styles.modalTitle}>{title}</Text>
                <Text style={styles.modalSubtitle}>{subtitle}</Text>
              </View>
              <View style={styles.modalHeaderActions}>
                {onSave ? (
                  <Pressable
                    onPress={saveDisabled ? undefined : onSave}
                    style={[styles.modalSaveButton, saveDisabled && styles.modalSaveButtonDisabled]}
                    hitSlop={8}
                  >
                    <Feather name="check" size={14} color={saveDisabled ? '#ACB4AD' : palette.paper} />
                    <Text style={[styles.modalSaveButtonText, saveDisabled && styles.modalSaveButtonTextDisabled]}>
                      {saveLabel}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} style={styles.modalCloseButton} hitSlop={8}>
                  <Feather name="x" size={18} color={palette.ink} />
                </Pressable>
              </View>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalBody, footer ? styles.modalBodyWithFooter : null]}
              automaticallyAdjustKeyboardInsets
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? <View style={styles.modalFooter}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  surfaceCard: {
    backgroundColor: palette.paper,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.stroke,
    ...shadow.card,
  },
  progressTrack: {
    height: 10,
    backgroundColor: palette.mist,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  metricPill: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: palette.mist,
    borderWidth: 1,
    borderColor: palette.stroke,
    flex: 1,
    gap: 3,
  },
  metricPillGood: {
    backgroundColor: '#E5F8EC',
    borderColor: '#BDE8CC',
  },
  metricPillWarm: {
    backgroundColor: '#FFF3E0',
    borderColor: '#F7D7A0',
  },
  metricLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
  },
  choiceChipSmall: {
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  choiceChipSelected: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  choiceChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.ink,
  },
  choiceChipTextSmall: {
    fontSize: 12,
  },
  choiceChipTextSelected: {
    color: palette.paper,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  buttonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonSolid: {
    backgroundColor: palette.mint,
  },
  buttonOutline: {
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke,
  },
  buttonGhost: {
    backgroundColor: palette.mist,
  },
  buttonDisabled: {
    backgroundColor: '#F0F2F0',
    borderColor: '#E0E8E1',
  },
  buttonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.paper,
    flexShrink: 1,
  },
  buttonTextSmall: {
    fontSize: 12,
  },
  buttonTextDark: {
    color: palette.ink,
  },
  buttonTextDisabled: {
    color: '#ACB4AD',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonIconSmall: {
    marginRight: 6,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.ink,
  },
  fieldHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: palette.muted,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.stroke,
    borderRadius: 18,
    backgroundColor: palette.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: palette.ink,
  },
  inputMultiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  emptyCard: {
    alignItems: 'flex-start',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 19,
    color: palette.ink,
  },
  emptyBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  emptyAction: {
    marginTop: 4,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 20, 13, 0.34)',
  },
  modalSheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FAFBF7',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#D6DDD5',
    marginTop: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 18,
    paddingBottom: 12,
    gap: 16,
  },
  modalHeading: {
    flex: 1,
    gap: 4,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.ink,
  },
  modalSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  modalSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: palette.mint,
  },
  modalSaveButtonDisabled: {
    backgroundColor: '#E0E8E1',
  },
  modalSaveButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.paper,
  },
  modalSaveButtonTextDisabled: {
    color: '#ACB4AD',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.paper,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalBody: {
    flexGrow: 1,
    paddingBottom: 28,
    gap: 16,
  },
  modalBodyWithFooter: {
    paddingBottom: 120,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: palette.stroke,
    backgroundColor: '#FAFBF7',
    paddingTop: 12,
    paddingBottom: 6,
  },
});
