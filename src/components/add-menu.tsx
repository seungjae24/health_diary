import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ModalSheet, SurfaceCard, PrimaryButton } from './ui';
import { palette, fontFamily } from '../theme';

export type AddOption = 'meal' | 'workout' | 'weight';

interface GlobalAddModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (option: AddOption) => void;
}

export function GlobalAddModal({ visible, onClose, onSelect }: GlobalAddModalProps) {
    return (
        <ModalSheet
            visible={visible}
            title="무엇을 기록할까요?"
            subtitle="카테고리를 선택한 후, 사진을 올리면 AI가 내용을 자동으로 채워줍니다."
            onClose={onClose}
        >
            <View style={styles.optionList}>
                <AddOptionItem
                    icon="coffee"
                    title="식단"
                    subtitle="음식 사진을 올려 메뉴와 양을 기록하세요."
                    accent={palette.mint}
                    onPress={() => onSelect('meal')}
                />
                <AddOptionItem
                    icon="activity"
                    title="운동"
                    subtitle="스마트워치 요약 등을 올려 수치를 기록하세요."
                    accent={palette.coral}
                    onPress={() => onSelect('workout')}
                />
                <AddOptionItem
                    icon="heart"
                    title="체중"
                    subtitle="체중계 사진으로 몸무게와 체지방을 기록하세요."
                    accent={palette.sky}
                    onPress={() => onSelect('weight')}
                />
            </View>
            <PrimaryButton label="취소" onPress={onClose} variant="ghost" />
        </ModalSheet>
    );
}

function AddOptionItem({ icon, title, subtitle, accent, onPress }: any) {
    return (
        <Pressable onPress={onPress}>
            <SurfaceCard style={styles.optionCard}>
                <View style={[styles.iconBox, { backgroundColor: accent + '15' }]}>
                    <Feather name={icon} size={24} color={accent} />
                </View>
                <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{title}</Text>
                    <Text style={styles.optionSubtitle}>{subtitle}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={palette.muted} />
            </SurfaceCard>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    optionList: {
        gap: 12,
        marginBottom: 12,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 16,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionText: {
        flex: 1,
    },
    optionTitle: {
        fontFamily: fontFamily.bold,
        fontSize: 18,
        color: palette.ink,
    },
    optionSubtitle: {
        fontFamily: fontFamily.regular,
        fontSize: 14,
        color: palette.muted,
        marginTop: 2,
    },
});
