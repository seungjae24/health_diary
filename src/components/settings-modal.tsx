import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { ModalSheet, FieldInput, ChoiceChip, PrimaryButton, SurfaceCard } from './ui';
import { useHealthData } from '../context/health-data-context';
import { fontFamily, palette } from '../theme';
import { SupplementPlan } from '../types';
import { calculateAge, makeId } from '../utils/format';

const BACKUP_SCHEMA = 'health-diary-backup-v1';

export function SettingsModal({
    visible,
    onClose
}: {
    visible: boolean;
    onClose: () => void;
}) {
    const { store, exportStoreSnapshot, importStoreSnapshot, saveAiSettings, saveProfile, saveSupplements } = useHealthData();
    const [settings, setSettings] = useState(store.aiSettings);
    const [profile, setProfile] = useState(store.profile);
    const [supplements, setSupplements] = useState(store.supplements);
    const [backupJson, setBackupJson] = useState('');
    const [importJson, setImportJson] = useState('');
    const [backupStatus, setBackupStatus] = useState<'idle' | 'ready' | 'imported' | 'error'>('idle');
    const [supplementDraft, setSupplementDraft] = useState({
        name: '',
        dosage: '',
        times: '아침',
        note: '',
        color: 'mint' as SupplementPlan['color'],
    });
    const [showKey, setShowKey] = useState(false);
    const [activeSection, setActiveSection] = useState<'profile' | 'supplements' | 'ai' | 'backup'>('profile');
    const [connectionStatus, setConnectionStatus] = useState<{
        gemini: 'idle' | 'checking' | 'ok' | 'error';
        openai: 'idle' | 'checking' | 'ok' | 'error';
        groq: 'idle' | 'checking' | 'ok' | 'error';
    }>({
        gemini: 'idle',
        openai: 'idle',
        groq: 'idle',
    });

    useEffect(() => {
        if (visible) {
            setSettings(store.aiSettings);
            setProfile(store.profile);
            setSupplements(store.supplements);
            setSupplementDraft({
                name: '',
                dosage: '',
                times: '아침',
                note: '',
                color: 'mint',
            });
            setShowKey(false);
            setBackupJson('');
            setImportJson('');
            setBackupStatus('idle');
            setConnectionStatus({
                gemini: 'idle',
                openai: 'idle',
                groq: 'idle',
            });
            setActiveSection('profile');
        }
    }, [visible, store.aiSettings, store.profile, store.supplements]);

    if (!settings) return null;

    function maskKey(key: string) {
        if (!key) return 'Not set';
        if (key.length <= 8) return '********';
        return `${key.slice(0, 6)}...${key.slice(-4)}`;
    }

    function handleSave() {
        saveProfile(profile);
        saveAiSettings(settings);
        saveSupplements(supplements);
        onClose();
    }

    function showMessage(title: string, message: string) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert(`${title}\n${message}`);
            return;
        }

        Alert.alert(title, message);
    }

    function createBackupJson() {
        return JSON.stringify(
            {
                schema: BACKUP_SCHEMA,
                exportedAt: new Date().toISOString(),
                data: exportStoreSnapshot(),
            },
            null,
            2,
        );
    }

    function handlePrepareBackup() {
        const json = createBackupJson();
        setBackupJson(json);
        setBackupStatus('ready');
        showMessage(
            '백업 준비 완료',
            '이 JSON을 저장해 두었다가 APK 설정 화면의 복원 칸에 붙여넣으면 기록을 이어서 사용할 수 있습니다.',
        );
    }

    function handleDownloadBackup() {
        const json = createBackupJson();
        setBackupJson(json);
        setBackupStatus('ready');

        if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
            showMessage('다운로드는 웹에서 가능', 'APK에서는 아래 백업 JSON을 복사해 메모나 Drive에 저장해 주세요.');
            return;
        }

        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

        link.href = url;
        link.download = `health-diary-backup-${stamp}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    function handleImportBackup() {
        try {
            const parsed = JSON.parse(importJson);
            const snapshot = parsed?.schema === BACKUP_SCHEMA ? parsed.data : parsed;

            if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.meals) || !Array.isArray(snapshot.workouts)) {
                throw new Error('invalid');
            }

            importStoreSnapshot(snapshot);

            const mergedSettings = {
                ...snapshot.aiSettings,
                openAiKey: settings.openAiKey,
                geminiKey: settings.geminiKey,
                groqKey: settings.groqKey,
            };

            setProfile(snapshot.profile ?? profile);
            setSupplements(snapshot.supplements ?? []);
            setSettings(mergedSettings);
            setBackupStatus('imported');

            showMessage(
                '복원 완료',
                '기록을 불러왔습니다. 이제 APK에서도 같은 기록으로 이어서 사용할 수 있습니다.',
            );
        } catch {
            setBackupStatus('error');
            showMessage('복원 실패', '백업 JSON 형식이 올바른지 다시 확인해 주세요.');
        }
    }

    async function verifyService(service: 'gemini' | 'openai' | 'groq') {
        setConnectionStatus((current) => ({ ...current, [service]: 'checking' }));
        try {
            if (service === 'gemini') {
                if (!settings.geminiKey || !settings.geminiModel) {
                    throw new Error('missing');
                }

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${settings.geminiKey}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                            generationConfig: { temperature: 0 },
                        }),
                    },
                );

                if (!response.ok) {
                    throw new Error('gemini');
                }
            }

            if (service === 'openai') {
                if (!settings.openAiKey || !settings.openAiModel) {
                    throw new Error('missing');
                }

                const response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${settings.openAiKey}`,
                    },
                    body: JSON.stringify({
                        model: settings.openAiModel,
                        input: 'ping',
                        max_output_tokens: 5,
                    }),
                });

                if (!response.ok) {
                    throw new Error('openai');
                }
            }

            if (service === 'groq') {
                if (!settings.groqKey || !settings.groqModel) {
                    throw new Error('missing');
                }

                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${settings.groqKey}`,
                    },
                    body: JSON.stringify({
                        model: settings.groqModel,
                        messages: [{ role: 'user', content: 'ping' }],
                        max_tokens: 5,
                    }),
                });

                if (!response.ok) {
                    throw new Error('groq');
                }
            }

            setConnectionStatus((current) => ({ ...current, [service]: 'ok' }));
        } catch {
            setConnectionStatus((current) => ({ ...current, [service]: 'error' }));
        }
    }

    function renderStatus(service: 'gemini' | 'openai' | 'groq') {
        const status = connectionStatus[service];

        if (status === 'checking') {
            return (
                <View style={styles.statusBadge}>
                    <ActivityIndicator size="small" color={palette.mintDeep} />
                    <Text style={styles.statusChecking}>확인중</Text>
                </View>
            );
        }

        if (status === 'ok') {
            return (
                <View style={[styles.statusBadge, styles.statusBadgeOk]}>
                    <Feather name="check-circle" size={14} color={palette.mintDeep} />
                    <Text style={styles.statusOk}>연결됨</Text>
                </View>
            );
        }

        if (status === 'error') {
            return (
                <View style={[styles.statusBadge, styles.statusBadgeError]}>
                    <Feather name="x-circle" size={14} color={palette.coral} />
                    <Text style={styles.statusError}>실패</Text>
                </View>
            );
        }

        return (
            <View style={styles.statusBadge}>
                <Feather name="minus-circle" size={14} color={palette.muted} />
                <Text style={styles.statusIdle}>미확인</Text>
            </View>
        );
    }

    function addSupplementPlan() {
        if (!supplementDraft.name.trim()) {
            return;
        }

        const times = supplementDraft.times
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

        if (!times.length) {
            return;
        }

        setSupplements((current) => [
            ...current,
            {
                id: makeId('supp'),
                name: supplementDraft.name.trim(),
                dosage: supplementDraft.dosage.trim(),
                times,
                note: supplementDraft.note.trim() || undefined,
                color: supplementDraft.color,
            },
        ]);
        setSupplementDraft({
            name: '',
            dosage: '',
            times: '아침',
            note: '',
            color: 'mint',
        });
    }

    const age = calculateAge(profile.birthDate);
    const activityLabel =
        profile.activityLevel === '1.2'
            ? '거의 운동 안 함'
            : profile.activityLevel === '1.375'
                ? '주 1~3회'
                : profile.activityLevel === '1.55'
                    ? '주 3~5회'
                    : profile.activityLevel === '1.725'
                        ? '주 6~7회'
                        : profile.activityLevel === '1.9'
                            ? '운동량 매우 많음'
                            : '미설정';
    const phaseLabel =
        profile.dietPhase === 'lean'
            ? 'Lean'
            : profile.dietPhase === 'lean-mass-up'
                ? 'Lean mass up'
                : 'Bulk up';

    return (
        <ModalSheet
            visible={visible}
            title="환경 설정"
            subtitle="기록 기준과 AI 연결을 한 화면에서 정리합니다."
            onClose={onClose}
        >
            <SurfaceCard style={styles.heroCard}>
                <View style={styles.heroHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.heroTitle}>빠른 요약</Text>
                        <Text style={styles.heroCaption}>긴 설명보다 지금 중요한 기준부터 위에 모아뒀어요.</Text>
                    </View>
                    <Feather name="settings" size={18} color={palette.mintDeep} />
                </View>
                <View style={styles.heroPillRow}>
                    <View style={styles.heroPill}>
                        <Text style={styles.heroPillLabel}>나이</Text>
                        <Text style={styles.heroPillValue}>{age === null ? '미설정' : `${age}세`}</Text>
                    </View>
                    <View style={styles.heroPill}>
                        <Text style={styles.heroPillLabel}>활동량</Text>
                        <Text style={styles.heroPillValue}>{activityLabel}</Text>
                    </View>
                    <View style={styles.heroPill}>
                        <Text style={styles.heroPillLabel}>목표</Text>
                        <Text style={styles.heroPillValue}>{phaseLabel}</Text>
                    </View>
                </View>
            </SurfaceCard>
            <View style={styles.sectionNav}>
                <Pressable style={[styles.sectionNavItem, activeSection === 'profile' && styles.sectionNavItemActive]} onPress={() => setActiveSection('profile')}>
                    <Feather name="user" size={16} color={activeSection === 'profile' ? palette.mintDeep : palette.muted} />
                    <Text style={[styles.sectionNavText, activeSection === 'profile' && styles.sectionNavTextActive]}>내 정보</Text>
                </Pressable>
                <Pressable style={[styles.sectionNavItem, activeSection === 'supplements' && styles.sectionNavItemActive]} onPress={() => setActiveSection('supplements')}>
                    <Feather name="plus-square" size={16} color={activeSection === 'supplements' ? palette.mintDeep : palette.muted} />
                    <Text style={[styles.sectionNavText, activeSection === 'supplements' && styles.sectionNavTextActive]}>영양제</Text>
                </Pressable>
                <Pressable style={[styles.sectionNavItem, activeSection === 'ai' && styles.sectionNavItemActive]} onPress={() => setActiveSection('ai')}>
                    <Feather name="cpu" size={16} color={activeSection === 'ai' ? palette.mintDeep : palette.muted} />
                    <Text style={[styles.sectionNavText, activeSection === 'ai' && styles.sectionNavTextActive]}>AI</Text>
                </Pressable>
                <Pressable style={[styles.sectionNavItem, activeSection === 'backup' && styles.sectionNavItemActive]} onPress={() => setActiveSection('backup')}>
                    <Feather name="archive" size={16} color={activeSection === 'backup' ? palette.mintDeep : palette.muted} />
                    <Text style={[styles.sectionNavText, activeSection === 'backup' && styles.sectionNavTextActive]}>백업</Text>
                </Pressable>
            </View>
            {activeSection === 'profile' ? (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>내 정보</Text>
                <Text style={styles.sectionCaption}>
                    체중, 식단, 운동 해석의 기준이 되는 값입니다.
                </Text>
                <SurfaceCard style={styles.card}>
                    <View style={styles.choiceRow}>
                        <ChoiceChip
                            label="남성"
                            selected={profile.sex === 'male'}
                            onPress={() => setProfile((current) => ({ ...current, sex: 'male' }))}
                        />
                        <ChoiceChip
                            label="여성"
                            selected={profile.sex === 'female'}
                            onPress={() => setProfile((current) => ({ ...current, sex: 'female' }))}
                        />
                        <ChoiceChip
                            label="기타"
                            selected={profile.sex === 'other'}
                            onPress={() => setProfile((current) => ({ ...current, sex: 'other' }))}
                        />
                    </View>
                    <FieldInput
                        label="키 (cm)"
                        placeholder="170"
                        keyboardType="decimal-pad"
                        value={profile.heightCm}
                        onChangeText={(heightCm) => setProfile((current) => ({ ...current, heightCm }))}
                    />
                    <FieldInput
                        label="생년월일"
                        placeholder="1995-08-21"
                        value={profile.birthDate}
                        onChangeText={(birthDate) => setProfile((current) => ({ ...current, birthDate }))}
                    />
                    <View style={styles.goalBlock}>
                        <Text style={styles.goalLabel}>활동량</Text>
                        <View style={styles.choiceWrap}>
                            <ChoiceChip
                                label="1.2"
                                selected={profile.activityLevel === '1.2'}
                                onPress={() => setProfile((current) => ({ ...current, activityLevel: '1.2' }))}
                            />
                            <ChoiceChip
                                label="1.375"
                                selected={profile.activityLevel === '1.375'}
                                onPress={() => setProfile((current) => ({ ...current, activityLevel: '1.375' }))}
                            />
                            <ChoiceChip
                                label="1.55"
                                selected={profile.activityLevel === '1.55'}
                                onPress={() => setProfile((current) => ({ ...current, activityLevel: '1.55' }))}
                            />
                            <ChoiceChip
                                label="1.725"
                                selected={profile.activityLevel === '1.725'}
                                onPress={() => setProfile((current) => ({ ...current, activityLevel: '1.725' }))}
                            />
                            <ChoiceChip
                                label="1.9"
                                selected={profile.activityLevel === '1.9'}
                                onPress={() => setProfile((current) => ({ ...current, activityLevel: '1.9' }))}
                            />
                        </View>
                        <Text style={styles.ageHint}>
                            {profile.activityLevel ? activityLabel : '활동량을 선택하면 유지칼로리 계산이 더 정확해집니다.'}
                        </Text>
                    </View>
                    <View style={styles.goalBlock}>
                        <Text style={styles.goalLabel}>현재 목표</Text>
                        <View style={styles.choiceWrap}>
                            <ChoiceChip
                                label="Lean"
                                selected={profile.dietPhase === 'lean'}
                                onPress={() => setProfile((current) => ({ ...current, dietPhase: 'lean' }))}
                            />
                            <ChoiceChip
                                label="Lean mass up"
                                selected={profile.dietPhase === 'lean-mass-up'}
                                onPress={() => setProfile((current) => ({ ...current, dietPhase: 'lean-mass-up' }))}
                            />
                            <ChoiceChip
                                label="Bulk up"
                                selected={profile.dietPhase === 'bulk-up'}
                                onPress={() => setProfile((current) => ({ ...current, dietPhase: 'bulk-up' }))}
                            />
                        </View>
                    </View>
                    <Text style={styles.ageHint}>
                        {age === null ? '만 나이: 생년월일을 입력하면 자동 계산됩니다.' : `만 나이: ${age}세`}
                    </Text>
                </SurfaceCard>
            </View>
            ) : null}

            {activeSection === 'ai' ? (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI 모드</Text>
                <Text style={styles.sectionCaption}>
                    기본 대화용 AI와 사진 분석용 AI를 나눠서 고를 수 있습니다.
                </Text>
                <SurfaceCard style={styles.card}>
                    <View style={styles.goalBlock}>
                        <Text style={styles.goalLabel}>기본 AI</Text>
                        <View style={styles.choiceWrap}>
                            <ChoiceChip
                                label="Gemini"
                                selected={settings.provider === 'gemini'}
                                onPress={() => setSettings(s => ({ ...s, provider: 'gemini' }))}
                            />
                            <ChoiceChip
                                label="OpenAI"
                                selected={settings.provider === 'openai'}
                                onPress={() => setSettings(s => ({ ...s, provider: 'openai' }))}
                            />
                        </View>
                    </View>
                    <View style={styles.goalBlock}>
                        <Text style={styles.goalLabel}>사진 분석 AI</Text>
                        <View style={styles.choiceWrap}>
                            <ChoiceChip
                                label="Groq"
                                selected={settings.imageAnalysisProvider === 'groq'}
                                onPress={() => setSettings(s => ({ ...s, imageAnalysisProvider: 'groq' }))}
                            />
                            <ChoiceChip
                                label="Gemini"
                                selected={settings.imageAnalysisProvider === 'gemini'}
                                onPress={() => setSettings(s => ({ ...s, imageAnalysisProvider: 'gemini' }))}
                            />
                            <ChoiceChip
                                label="OpenAI"
                                selected={settings.imageAnalysisProvider === 'openai'}
                                onPress={() => setSettings(s => ({ ...s, imageAnalysisProvider: 'openai' }))}
                            />
                            <ChoiceChip
                                label="비교"
                                selected={settings.imageAnalysisProvider === 'compare'}
                                onPress={() => setSettings(s => ({ ...s, imageAnalysisProvider: 'compare' }))}
                            />
                        </View>
                    </View>
                </SurfaceCard>
            </View>
            ) : null}

            {activeSection === 'supplements' ? (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>영양제 / 약 체크</Text>
                <Text style={styles.sectionCaption}>
                    홈 화면에서 체크할 복용 항목을 등록합니다.
                </Text>
                <SurfaceCard style={styles.card}>
                    {supplements.length ? (
                        <View style={styles.supplementList}>
                            {supplements.map((item) => (
                                <View key={item.id} style={styles.supplementRow}>
                                    <View style={[styles.supplementDot, item.color === 'sky' && styles.dotSky, item.color === 'coral' && styles.dotCoral, item.color === 'amber' && styles.dotAmber]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.supplementName}>{item.name}</Text>
                                        <Text style={styles.supplementMeta}>
                                            {[item.dosage, item.times.join(' / ')].filter(Boolean).join(' · ')}
                                        </Text>
                                    </View>
                                    <Pressable onPress={() => setSupplements((current) => current.filter((supplement) => supplement.id !== item.id))}>
                                        <Feather name="trash-2" size={16} color={palette.coral} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text style={styles.emptySupplements}>아직 등록한 영양제가 없습니다.</Text>
                    )}

                    <View style={styles.supplementDraftBlock}>
                        <FieldInput
                            label="이름"
                            placeholder="오메가3, 종합비타민, 처방약 이름"
                            value={supplementDraft.name}
                            onChangeText={(name) => setSupplementDraft((current) => ({ ...current, name }))}
                        />
                        <FieldInput
                            label="복용량"
                            placeholder="1정, 2캡슐, 10ml"
                            value={supplementDraft.dosage}
                            onChangeText={(dosage) => setSupplementDraft((current) => ({ ...current, dosage }))}
                        />
                        <FieldInput
                            label="시간대"
                            placeholder="아침, 점심, 저녁"
                            value={supplementDraft.times}
                            onChangeText={(times) => setSupplementDraft((current) => ({ ...current, times }))}
                        />
                        <FieldInput
                            label="메모"
                            placeholder="식후 복용, 운동 후, 공복 금지 등"
                            value={supplementDraft.note}
                            onChangeText={(note) => setSupplementDraft((current) => ({ ...current, note }))}
                        />
                        <View style={styles.choiceWrap}>
                            {(['mint', 'sky', 'coral', 'amber'] as SupplementPlan['color'][]).map((color) => (
                                <ChoiceChip
                                    key={color}
                                    label={color}
                                    selected={supplementDraft.color === color}
                                    onPress={() => setSupplementDraft((current) => ({ ...current, color }))}
                                />
                            ))}
                        </View>
                        <PrimaryButton label="영양제 추가" onPress={addSupplementPlan} icon="plus" variant="outline" />
                    </View>
                </SurfaceCard>
            </View>
            ) : null}

            {activeSection === 'backup' ? (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>데이터 백업 / 복원</Text>
                <Text style={styles.sectionCaption}>
                    웹 기록을 APK로 옮길 때 쓰는 기능입니다. API 키는 백업에 포함되지 않습니다.
                </Text>
                <SurfaceCard style={styles.card}>
                    <View style={styles.backupActions}>
                        <PrimaryButton label="백업 JSON 만들기" onPress={handlePrepareBackup} icon="save" variant="outline" />
                        <PrimaryButton label="백업 파일 다운로드" onPress={handleDownloadBackup} icon="download" variant="ghost" />
                    </View>
                    <Text style={styles.backupHint}>
                        1. 웹에서 백업 JSON을 만들거나 다운로드합니다.
                    </Text>
                    <Text style={styles.backupHint}>
                        2. APK 설정 화면의 복원 칸에 그대로 붙여넣습니다.
                    </Text>
                    <Text style={styles.backupHint}>
                        3. 복원 후 바로 기존 기록으로 이어서 사용할 수 있습니다. 일부 웹 임시 사진 URI는 기기에서 다시 연결되지 않을 수 있습니다.
                    </Text>
                    <FieldInput
                        label="백업 JSON"
                        hint={backupStatus === 'ready' ? '준비됨' : backupStatus === 'imported' ? '최근 복원 완료' : backupStatus === 'error' ? '형식 확인 필요' : '아직 생성 전'}
                        placeholder="웹에서 만든 백업 JSON이 여기에 표시됩니다."
                        value={backupJson}
                        onChangeText={setBackupJson}
                        multiline
                    />
                    <FieldInput
                        label="복원용 JSON 붙여넣기"
                        placeholder="웹에서 저장한 백업 JSON 전체를 여기에 붙여넣으세요."
                        value={importJson}
                        onChangeText={setImportJson}
                        multiline
                    />
                    <PrimaryButton
                        label="이 백업으로 복원하기"
                        onPress={handleImportBackup}
                        icon="upload"
                        disabled={!importJson.trim()}
                    />
                </SurfaceCard>
            </View>
            ) : null}

            {activeSection === 'ai' ? (
            <>
            <SurfaceCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <Feather name="cpu" size={18} color={palette.mintDeep} />
                    <Text style={styles.cardTitle}>Gemini 설정</Text>
                    {renderStatus('gemini')}
                </View>

                <View style={styles.keyContainer}>
                    <FieldInput
                        label="API 키"
                        secureTextEntry={!showKey}
                        placeholder="AIza..."
                        value={settings.geminiKey}
                        onChangeText={text => setSettings(s => ({ ...s, geminiKey: text }))}
                        style={styles.keyInput}
                    />
                    <Pressable onPress={() => setShowKey(!showKey)} style={styles.eyeBtn}>
                        <Feather name={showKey ? 'eye-off' : 'eye'} size={18} color={palette.muted} />
                    </Pressable>
                </View>
                {!showKey && settings.geminiKey && (
                    <Text style={styles.maskedHint}>현재 설정됨: {maskKey(settings.geminiKey)}</Text>
                )}

                <FieldInput
                    label="모델 이름"
                    placeholder="gemini-2.5-flash"
                    value={settings.geminiModel}
                    onChangeText={text => setSettings(s => ({ ...s, geminiModel: text }))}
                />
                <PrimaryButton label="Gemini 연결 확인" onPress={() => verifyService('gemini')} icon="shield" variant="outline" />
            </SurfaceCard>

            <SurfaceCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <Feather name="zap" size={18} color={palette.coral} />
                    <Text style={styles.cardTitle}>OpenAI 설정 (선택)</Text>
                    {renderStatus('openai')}
                </View>
                <FieldInput
                    label="API 키"
                    secureTextEntry
                    placeholder="sk-..."
                    value={settings.openAiKey}
                    onChangeText={text => setSettings(s => ({ ...s, openAiKey: text }))}
                />
                <FieldInput
                    label="모델 이름"
                    placeholder="gpt-5-mini"
                    value={settings.openAiModel}
                    onChangeText={text => setSettings(s => ({ ...s, openAiModel: text }))}
                />
                <PrimaryButton label="OpenAI 연결 확인" onPress={() => verifyService('openai')} icon="shield" variant="outline" />
            </SurfaceCard>

            <SurfaceCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <Feather name="wind" size={18} color={palette.sky} />
                    <Text style={styles.cardTitle}>Groq 설정 (권장)</Text>
                    {renderStatus('groq')}
                </View>
                <FieldInput
                    label="API 키"
                    secureTextEntry
                    placeholder="gsk_..."
                    value={settings.groqKey}
                    onChangeText={text => setSettings(s => ({ ...s, groqKey: text }))}
                />
                <FieldInput
                    label="모델 이름"
                    placeholder="meta-llama/llama-4-scout-17b-16e-instruct"
                    value={settings.groqModel}
                    onChangeText={text => setSettings(s => ({ ...s, groqModel: text }))}
                />
                <PrimaryButton label="Groq 연결 확인" onPress={() => verifyService('groq')} icon="shield" variant="outline" />
            </SurfaceCard>
            </>
            ) : null}

            <PrimaryButton label="설정 저장하기" onPress={handleSave} icon="check" />
        </ModalSheet>
    );
}

const styles = StyleSheet.create({
    heroCard: {
        gap: 14,
        padding: 18,
        backgroundColor: '#F7FBF8',
        borderColor: '#D8E9DE',
    },
    heroHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    heroTitle: {
        fontFamily: fontFamily.bold,
        fontSize: 18,
        color: palette.ink,
    },
    heroCaption: {
        marginTop: 4,
        fontFamily: fontFamily.regular,
        fontSize: 13,
        lineHeight: 19,
        color: palette.muted,
    },
    heroPillRow: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    heroPill: {
        minWidth: 96,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: palette.paper,
        borderWidth: 1,
        borderColor: palette.stroke,
    },
    heroPillLabel: {
        fontFamily: fontFamily.medium,
        fontSize: 11,
        color: palette.muted,
    },
    heroPillValue: {
        marginTop: 3,
        fontFamily: fontFamily.bold,
        fontSize: 13,
        color: palette.ink,
    },
    sectionNav: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 4,
    },
    sectionNavItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: palette.paper,
        borderWidth: 1,
        borderColor: palette.stroke,
    },
    sectionNavItemActive: {
        backgroundColor: '#EDF7F1',
        borderColor: '#D3E9DA',
    },
    sectionNavText: {
        fontFamily: fontFamily.medium,
        fontSize: 13,
        color: palette.muted,
    },
    sectionNavTextActive: {
        color: palette.mintDeep,
    },
    section: {
        gap: 12,
        marginBottom: 8,
    },
    sectionTitle: {
        fontFamily: fontFamily.bold,
        fontSize: 15,
        color: palette.ink,
        marginLeft: 4,
    },
    sectionCaption: {
        fontFamily: fontFamily.regular,
        fontSize: 13,
        color: palette.muted,
        lineHeight: 19,
        marginLeft: 4,
        marginRight: 4,
    },
    choiceRow: {
        flexDirection: 'row',
        gap: 10,
    },
    choiceWrap: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    card: {
        gap: 16,
        padding: 18,
    },
    backupActions: {
        gap: 10,
    },
    backupHint: {
        fontFamily: fontFamily.regular,
        fontSize: 13,
        lineHeight: 19,
        color: palette.muted,
    },
    goalBlock: {
        gap: 10,
    },
    goalLabel: {
        fontFamily: fontFamily.medium,
        fontSize: 13,
        color: palette.ink,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'space-between',
    },
    cardTitle: {
        fontFamily: fontFamily.bold,
        fontSize: 17,
        color: palette.ink,
    },
    keyContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
    },
    keyInput: {
        flex: 1,
    },
    eyeBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: palette.mist,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 1,
    },
    maskedHint: {
        fontFamily: fontFamily.medium,
        fontSize: 12,
        color: palette.mintDeep,
        marginTop: -8,
        marginLeft: 2,
    },
    ageHint: {
        fontFamily: fontFamily.medium,
        fontSize: 12,
        color: palette.mintDeep,
    },
    supplementList: {
        gap: 10,
    },
    supplementRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    supplementDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: palette.mint,
    },
    dotSky: {
        backgroundColor: palette.sky,
    },
    dotCoral: {
        backgroundColor: palette.coral,
    },
    dotAmber: {
        backgroundColor: palette.amber,
    },
    supplementName: {
        fontFamily: fontFamily.bold,
        fontSize: 14,
        color: palette.ink,
    },
    supplementMeta: {
        marginTop: 2,
        fontFamily: fontFamily.regular,
        fontSize: 12,
        color: palette.muted,
    },
    emptySupplements: {
        fontFamily: fontFamily.regular,
        fontSize: 13,
        color: palette.muted,
    },
    supplementDraftBlock: {
        gap: 12,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: palette.stroke,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#F2F4F1',
    },
    statusBadgeOk: {
        backgroundColor: '#E7F6EE',
    },
    statusBadgeError: {
        backgroundColor: '#FFE8E1',
    },
    statusIdle: {
        fontFamily: fontFamily.medium,
        fontSize: 12,
        color: palette.muted,
    },
    statusChecking: {
        fontFamily: fontFamily.medium,
        fontSize: 12,
        color: palette.mintDeep,
    },
    statusOk: {
        fontFamily: fontFamily.bold,
        fontSize: 12,
        color: palette.mintDeep,
    },
    statusError: {
        fontFamily: fontFamily.bold,
        fontSize: 12,
        color: palette.coral,
    },
});
