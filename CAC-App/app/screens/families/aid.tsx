import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getFamiliesAid } from '@/app/api';
import { useAuth } from '@/app/context/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PRIMARY = '#6C47FF';

type AidProgram = {
  id: string | number;
  name: string;
  summary: string;
  steps?: string;
  external_url?: string;
  tags?: string[];
};

type Recommendation = {
  id: string | number;
  title: string;
  reason?: string;
};

type SupportInfo = {
  chat_hours?: string;
  languages?: string[];
  document_storage_days?: number;
};

export default function FamiliesAid() {
  const { token } = useAuth();
  const [programs, setPrograms] = useState<AidProgram[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [support, setSupport] = useState<SupportInfo>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme as 'light' | 'dark'];
  const styles = useMemo(() => createStyles(palette, colorScheme as 'light' | 'dark'), [palette, colorScheme]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
  const res = await getFamiliesAid(token);
        if (!mounted) return;
        setPrograms(res?.programs || []);
        setRecommendations(res?.recommendations || []);
        setSupport(res?.support || {});
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Unable to load aid programs');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [token]);

  function openProgram(url?: string) {
    if (!url) return;
    Linking.openURL(url).catch(() => setError('Unable to open the program link right now.'));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.screenTitle}>Aid & Benefits</Text>
      <Text style={styles.subtitle}>
        Autofill forms with your saved info and track application status in one place.
      </Text>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={PRIMARY} />
          <Text style={styles.loadingText}>Finding programs tailored to you…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color={PRIMARY} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.aiBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.sparkleIcon}>
            <Ionicons name="sparkles" size={20} color={PRIMARY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>AI assistant is ready</Text>
            <Text style={styles.bannerSubtitle}>We’ll pre-fill forms with verified household data.</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.bannerButton}>
          <Text style={styles.bannerButtonText}>Review stored documents</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested for your household</Text>
        {programs.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No programs found yet. Try refreshing in a moment.</Text>
        ) : (
          programs.map((program) => (
          <View key={program.id} style={styles.programCard}>
            <View style={styles.programHeader}>
              <Text style={styles.programName}>{program.name}</Text>
              <TouchableOpacity onPress={() => openProgram(program.external_url)}>
                <Ionicons name="open-outline" size={18} color={PRIMARY} />
              </TouchableOpacity>
            </View>
            <Text style={styles.programSummary}>{program.summary}</Text>
            {!!program.steps && <Text style={styles.programSteps}>{program.steps}</Text>}
            <View style={styles.tagRow}>
              {(program.tags || []).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Auto-fill application</Text>
            </TouchableOpacity>
          </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personalized recommendations</Text>
        {recommendations.length === 0 && !loading ? (
          <Text style={styles.emptyText}>We’ll surface recommendations once you complete a pickup.</Text>
        ) : (
          recommendations.map((rec) => (
          <View key={rec.id} style={styles.recommendationCard}>
            <Text style={styles.recommendationTitle}>{rec.title}</Text>
            {!!rec.reason && <Text style={styles.recommendationReason}>{rec.reason}</Text>}
            <TouchableOpacity style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Check eligibility</Text>
            </TouchableOpacity>
          </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support resources</Text>
        <View style={styles.supportCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={PRIMARY} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Talk to a benefits navigator</Text>
            <Text style={styles.supportSubtitle}>
              {support.chat_hours ? `${support.chat_hours}` : 'Live chat weekdays'}
              {support.languages?.length ? ` • ${support.languages.join(', ')}` : ''}
            </Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.link}>Start chat</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.supportCard}>
          <Ionicons name="book-outline" size={20} color={PRIMARY} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Upload supporting documents</Text>
            <Text style={styles.supportSubtitle}>
              Secure vault • Auto-expiring after {support.document_storage_days || 60} days
            </Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.link}>Manage</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: typeof Colors.light, mode: 'light' | 'dark') => {
  const surface = mode === 'dark' ? '#1F2430' : '#FFFFFF';
  const surfaceAlt = mode === 'dark' ? '#252C3C' : '#EEF2FF';
  const border = mode === 'dark' ? '#2F3545' : '#E5E7EB';
  const subtleSurface = mode === 'dark' ? '#1D2230' : '#EEF2FF';
  const infoSurface = mode === 'dark' ? '#1F2A45' : '#EEF2FF';
  const sparkleBg = mode === 'dark' ? '#2B2550' : '#F1ECFF';
  const textSecondary = mode === 'dark' ? '#B3BCD6' : '#4B5563';
  const textMuted = mode === 'dark' ? '#96A3BB' : '#6B7280';
  const errorBg = mode === 'dark' ? '#3B1F24' : '#FDE8E8';
  const errorText = mode === 'dark' ? '#FCA5A5' : '#B91C1C';
  const shadowColor = mode === 'dark' ? 'transparent' : '#101828';
  const shadowOpacity = mode === 'dark' ? 0 : 0.06;

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    scrollView: { flex: 1 },
    container: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 40,
      backgroundColor: palette.background,
    },
    screenTitle: { fontSize: 24, fontWeight: '700', color: palette.text },
    subtitle: { marginTop: 6, fontSize: 14, color: textSecondary, marginBottom: 18 },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: subtleSurface,
      padding: 12,
      borderRadius: 12,
      marginBottom: 14,
    },
    loadingText: { color: mode === 'dark' ? '#C3D1FF' : '#3730A3', fontWeight: '600', fontSize: 13 },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: errorBg,
      padding: 12,
      borderRadius: 12,
      marginBottom: 14,
    },
    errorText: { flex: 1, color: errorText, fontSize: 13 },
    aiBanner: {
      backgroundColor: infoSurface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 22,
      gap: 14,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: mode === 'dark' ? '#2F3B5B' : 'transparent',
    },
    sparkleIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: sparkleBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
    bannerSubtitle: { fontSize: 13, color: textSecondary },
    bannerButton: {
      alignSelf: 'flex-start',
      backgroundColor: surface,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
    },
    bannerButtonText: { color: PRIMARY, fontWeight: '600' },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: palette.text, marginBottom: 12 },
    programCard: {
      backgroundColor: surface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
      gap: 10,
    },
    programHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    programName: { fontSize: 16, fontWeight: '600', color: palette.text, flex: 1, marginRight: 12 },
    programSummary: { fontSize: 13, color: textSecondary },
    programSteps: { fontSize: 12, color: textMuted },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
      backgroundColor: surfaceAlt,
      borderRadius: 20,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    tagText: { color: PRIMARY, fontSize: 12, fontWeight: '600' },
    primaryButton: {
      backgroundColor: PRIMARY,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryButtonText: { color: '#fff', fontWeight: '600' },
    recommendationCard: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: border,
      gap: 10,
    },
    recommendationTitle: { fontSize: 15, fontWeight: '600', color: palette.text },
    recommendationReason: { fontSize: 13, color: textSecondary },
    secondaryButton: {
      backgroundColor: mode === 'dark' ? '#2D214F' : '#EDE9FE',
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    secondaryText: { color: PRIMARY, fontWeight: '600' },
    emptyText: { fontSize: 13, color: textMuted, marginBottom: 12 },
    supportCard: {
      backgroundColor: surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: mode === 'dark' ? 1 : 0,
      borderColor: border,
      shadowColor,
      shadowOpacity: mode === 'dark' ? 0 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: mode === 'dark' ? 0 : 2,
    },
    supportTitle: { fontSize: 15, fontWeight: '600', color: palette.text },
    supportSubtitle: { fontSize: 12, color: textMuted, marginTop: 2 },
    link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  });
};
