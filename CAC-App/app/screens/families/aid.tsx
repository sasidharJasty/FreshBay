import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#6C47FF';
const BACKGROUND = '#F8F9FF';

const programs = [
  {
    id: 'prog-1',
    name: 'CalFresh (SNAP) Renewal',
    summary: 'Monthly grocery benefits for qualified households.',
    steps: 'Estimated 12 minutes — pre-fill with your saved info.',
    link: 'https://www.getcalfresh.org/',
    tags: ['Food assistance', 'EBT card'],
  },
  {
    id: 'prog-2',
    name: 'Women, Infants, and Children (WIC)',
    summary: 'Nutrition support for pregnant people and children under 5.',
    steps: 'Upload proof of address & ID. AI can pre-complete forms for you.',
    link: 'https://myfamily.wic.ca.gov/',
    tags: ['Nutrition', 'Women & children'],
  },
  {
    id: 'prog-3',
    name: 'LIHEAP Utility Relief',
    summary: 'One-time credit toward your PG&E bill.',
    steps: 'Share income docs. We auto-fill the application.',
    link: 'https://www.csd.ca.gov/',
    tags: ['Utilities', 'Energy'],
  },
];

const recommendations = [
  {
    id: 'rec-1',
    title: 'You may qualify for: Medi-Cal Managed Care',
    reason: 'Based on your household size (4) and current income.',
  },
  {
    id: 'rec-2',
    title: 'You may qualify for: School Meal Waiver',
    reason: 'Your children’s school is in a Community Eligibility Provision zone.',
  },
];

export default function FamiliesAid() {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Aid & Benefits</Text>
      <Text style={styles.subtitle}>
        Autofill forms with your saved info and track application status in one place.
      </Text>

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
        {programs.map((program) => (
          <View key={program.id} style={styles.programCard}>
            <View style={styles.programHeader}>
              <Text style={styles.programName}>{program.name}</Text>
              <TouchableOpacity>
                <Ionicons name="open-outline" size={18} color={PRIMARY} />
              </TouchableOpacity>
            </View>
            <Text style={styles.programSummary}>{program.summary}</Text>
            <Text style={styles.programSteps}>{program.steps}</Text>
            <View style={styles.tagRow}>
              {program.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Auto-fill application</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personalized recommendations</Text>
        {recommendations.map((rec) => (
          <View key={rec.id} style={styles.recommendationCard}>
            <Text style={styles.recommendationTitle}>{rec.title}</Text>
            <Text style={styles.recommendationReason}>{rec.reason}</Text>
            <TouchableOpacity style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Check eligibility</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support resources</Text>
        <View style={styles.supportCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={PRIMARY} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Talk to a benefits navigator</Text>
            <Text style={styles.supportSubtitle}>Live chat weekdays • Se habla español</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.link}>Start chat</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.supportCard}>
          <Ionicons name="book-outline" size={20} color={PRIMARY} />
          <View style={{ flex: 1 }}>
            <Text style={styles.supportTitle}>Upload supporting documents</Text>
            <Text style={styles.supportSubtitle}>Secure vault • Auto-expiring after 60 days</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.link}>Manage</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    backgroundColor: BACKGROUND,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 6, fontSize: 14, color: '#4B5563', marginBottom: 18 },
  aiBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    gap: 14,
  },
  sparkleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  bannerSubtitle: { fontSize: 13, color: '#4B5563' },
  bannerButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bannerButtonText: { color: PRIMARY, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 12 },
  programCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  programHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  programName: { fontSize: 16, fontWeight: '600', color: '#1F2937', flex: 1, marginRight: 12 },
  programSummary: { fontSize: 13, color: '#4B5563', marginBottom: 8 },
  programSteps: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tag: {
    backgroundColor: '#EEF2FF',
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
  },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  recommendationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recommendationTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 6 },
  recommendationReason: { fontSize: 13, color: '#4B5563', marginBottom: 12 },
  secondaryButton: {
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: { color: PRIMARY, fontWeight: '600' },
  supportCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  supportTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  supportSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
});
