import { Feather } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import React, { ComponentProps, useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { fontFamily, palette } from '../theme';
import { useSync } from '../context/sync-context';
import { useGlobalUi } from '../context/global-ui-context';
import { Platform } from 'react-native';

type IconName = ComponentProps<typeof Feather>['name'];

export function ScreenFrame({
  title,
  subtitle,
  accent,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  children,
  contentContainerStyle,
}: {
  title: string;
  subtitle: string;
  accent: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const reveal = useRef(new Animated.Value(0)).current;
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { user, status, login, logout, backup, restore } = useSync();
  const { openSettings } = useGlobalUi();

  useEffect(() => {
    Animated.spring(reveal, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 52,
    }).start();
  }, [reveal]);

  function handleSyncPress() {
    if (!user) {
      login();
      return;
    }

    if (Platform.OS === 'web') {
      if (window.confirm(`${user.name}님, 로그아웃 하시겠습니까?`)) logout();
      return;
    }

    Alert.alert(
      `${user.name}님`,
      '로그아웃 하시겠습니까?',
      [
        { text: '로그아웃', style: 'destructive', onPress: logout },
        { text: '취소', style: 'cancel' },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.root}>
        <LinearGradient
          colors={['#F4FFF7', '#F6F7F1', '#F6F7F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.background}
        />
        <View style={[styles.blob, { backgroundColor: accent }]} />
        <View style={[styles.blobSecondary, { borderColor: accent }]} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + tabBarHeight + Math.max(insets.bottom - 12, 0) },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.headerWrap,
              {
                opacity: reveal,
                transform: [
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.headerTopLine}>
              <Text style={styles.brandText}>HealthDiary</Text>
              <View style={styles.headerActionsWrap}>
                <Pressable
                  onPress={handleSyncPress}
                  style={[styles.syncHeaderBtn, user && styles.syncHeaderBtnLogged]}
                >
                  <Feather
                    name={user ? 'user' : 'cloud'}
                    size={14}
                    color={user ? palette.mintDeep : palette.ink}
                  />
                  <Text style={[styles.syncHeaderBtnText, user && styles.syncHeaderBtnTextLogged]}>
                    {user ? user.name : 'Google 연동'}
                  </Text>
                </Pressable>

                {user ? (
                  <Pressable
                    onPress={backup}
                    disabled={status === 'syncing'}
                    style={[styles.syncUploadBtn, status === 'syncing' && styles.syncUploadBtnActive]}
                  >
                    {status === 'syncing'
                      ? <ActivityIndicator size="small" color={palette.mintDeep} />
                      : <Feather name="upload-cloud" size={16} color={palette.mintDeep} />
                    }
                  </Pressable>
                ) : null}

                {actionLabel && onAction ? (
                  <Pressable onPress={onAction} style={styles.headerAction}>
                    <Feather name={actionIcon} size={16} color={palette.paper} />
                    <Text style={styles.headerActionText}>{actionLabel}</Text>
                  </Pressable>
                ) : null}

                <Pressable onPress={openSettings} style={styles.settingsHeaderBtn}>
                  <Feather name="settings" size={18} color={palette.ink} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {onSearchChange ? (
              <View style={styles.searchBar}>
                <Feather name="search" size={18} color={palette.muted} />
                <TextInput
                  value={searchValue}
                  onChangeText={onSearchChange}
                  placeholder={searchPlaceholder ?? '검색...'}
                  placeholderTextColor="#96A095"
                  style={styles.searchInput}
                />
              </View>
            ) : null}
          </Animated.View>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  root: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  blob: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 999,
    opacity: 0.08,
    top: -80,
    right: -20,
  },
  blobSecondary: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    borderWidth: 22,
    opacity: 0.12,
    left: -70,
    top: 130,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  headerWrap: {
    paddingTop: 8,
    gap: 12,
  },
  headerTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: palette.muted,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: palette.mint,
  },
  headerActionText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.paper,
  },
  headerActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F0F2EE',
    borderWidth: 1,
    borderColor: '#E1E7E0',
  },
  syncHeaderBtnLogged: {
    backgroundColor: '#E7F6EE',
    borderColor: '#BDE8CC',
  },
  syncHeaderBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.ink,
  },
  syncHeaderBtnTextLogged: {
    color: palette.mintDeep,
    fontFamily: fontFamily.bold,
  },
  settingsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F0F2EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E7E0',
  },
  syncUploadBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E7F6EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BDE8CC',
  },
  syncUploadBtnActive: {
    opacity: 0.6,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 23,
    color: palette.muted,
    maxWidth: '88%',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F1F3EE',
    borderWidth: 1,
    borderColor: '#E1E7E0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: palette.ink,
  },
});
