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

    return (
        <ModalSheet
            visible={visible}
            title="환경 설정"
            subtitle="AI 설정 및 API 키를 안전하게 관리하세요."
            onClose={onClose}
        >
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>내 정보</Text>
                <Text style={styles.sectionCaption}>
                    성별, 키, 생년월일을 입력해 두면 건강 기록과 목표를 해석할 때 기준 정보로 활용하기 좋습니다.
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

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI 서비스 제공자</Text>
                <Text style={styles.sectionCaption}>
                    홈 화면 질문하기와 목표 분석에 사용할 기본 AI를 선택합니다.
                </Text>
                <View style={styles.choiceRow}>
                    <ChoiceChip
                        label="Gemini (Google)"
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

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>이미지 분석 제공자</Text>
                <Text style={styles.sectionCaption}>
                    사진 첨부 AI 분석에 사용할 엔진입니다. 현재는 Groq를 권장합니다. `비교`를 선택하면 사용 가능한 엔진들을 함께 실행해 더 많은 값을 뽑은 결과를 우선 사용합니다. Meals의 `AI 분석용 설명`도 이제 연결된 OpenAI, Groq, Gemini 중 가능한 엔진으로 계산합니다.
                </Text>
                <View style={styles.choiceRow}>
                    <ChoiceChip
                        label="Groq (권장)"
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

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>영양제 / 약 체크</Text>
                <Text style={styles.sectionCaption}>
                    매일 챙겨 먹어야 하는 영양제나 약을 등록하면 홈 화면에서 시간대별 체크가 가능합니다.
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

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>데이터 백업 / 복원</Text>
                <Text style={styles.sectionCaption}>
                    웹에서 작성한 기록을 APK로 옮길 때 쓰는 기능입니다. 백업에는 식사, 운동, 체중, 목표, 영양제, 설정값이 포함되고 API 키는 보안상 제외됩니다.
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

            <PrimaryButton label="설정 저장하기" onPress={handleSave} icon="check" />
        </ModalSheet>
    );
}

const styles = StyleSheet.create({
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
        padding: 20,
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
