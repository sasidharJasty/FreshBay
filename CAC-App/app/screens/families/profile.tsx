import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#6C47FF';
const BACKGROUND = '#F8F9FF';

const familyMembers = [
  { name: 'Maria Alvarez', role: 'Primary contact' },
  { name: 'Luis Alvarez', role: 'Partner' },
  { name: 'Sofia (8)', role: 'Child' },
  { name: 'Mateo (5)', role: 'Child' },
];

const preferences = ['Low-sodium', 'Vegetarian options', 'No peanuts'];

const impactStats = [
  { label: 'Meals received', value: '128' },
  { label: 'CO₂ saved', value: '420 lbs' },
  { label: 'Volunteer hours exchanged', value: '6 hrs' },
];

export default function FamiliesProfile() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [privacyShare, setPrivacyShare] = useState(true);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Your family profile</Text>
      <Text style={styles.subtitle}>Update household details so we can tailor pickups and benefits.</Text>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Household</Text>
          <TouchableOpacity>
            <Text style={styles.link}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>MA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryName}>Maria Alvarez</Text>
            <Text style={styles.primaryMeta}>Family size 4 • ZIP 95307</Text>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color={PRIMARY} />
              <Text style={styles.infoText}>maria.alvarez@email.com</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color={PRIMARY} />
              <Text style={styles.infoText}>(209) 555-0162</Text>
            </View>
          </View>
        </View>
        <View style={styles.membersCard}>
          {familyMembers.map((member) => (
            <View key={member.name} style={styles.memberRow}>
              <Ionicons name="people-outline" size={16} color={PRIMARY} />
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberRole}>{member.role}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Food preferences</Text>
        <View style={styles.preferenceWrap}>
          {preferences.map((pref) => (
            <View key={pref} style={styles.preferenceChip}>
              <Ionicons name="leaf-outline" size={14} color={PRIMARY} />
              <Text style={styles.preferenceText}>{pref}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Update dietary preferences</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Impact summary</Text>
        <View style={styles.impactGrid}>
          {impactStats.map((stat) => (
            <View key={stat.label} style={styles.impactCard}>
              <Text style={styles.impactValue}>{stat.value}</Text>
              <Text style={styles.impactLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.linkRow}>
          <Ionicons name="stats-chart-outline" size={16} color={PRIMARY} />
          <Text style={styles.link}>View detailed impact report</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { marginBottom: 36 }]}>
        <Text style={styles.sectionTitle}>Notifications & privacy</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Push notifications</Text>
            <Text style={styles.settingSubtitle}>Pickup reminders & new donation alerts</Text>
          </View>
          <Switch value={pushEnabled} onValueChange={setPushEnabled} thumbColor={pushEnabled ? PRIMARY : '#fff'} />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>SMS updates</Text>
            <Text style={styles.settingSubtitle}>Send texts when volunteer drivers are on route</Text>
          </View>
          <Switch value={smsEnabled} onValueChange={setSmsEnabled} thumbColor={smsEnabled ? PRIMARY : '#fff'} />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Share pickup history with partner agencies</Text>
            <Text style={styles.settingSubtitle}>Helps unlock more aid recommendations</Text>
          </View>
          <Switch value={privacyShare} onValueChange={setPrivacyShare} thumbColor={privacyShare ? PRIMARY : '#fff'} />
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
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  link: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    shadowColor: '#101828',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: PRIMARY, fontWeight: '700', fontSize: 16 },
  primaryName: { fontSize: 17, fontWeight: '600', color: '#1F2937' },
  primaryMeta: { fontSize: 13, color: '#6B7280', marginVertical: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, color: '#4B5563' },
  membersCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  memberName: { flex: 1, fontSize: 14, color: '#1F2937' },
  memberRole: { fontSize: 12, color: '#6B7280' },
  preferenceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  preferenceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  preferenceText: { color: PRIMARY, fontSize: 12, fontWeight: '600' },
  secondaryButton: {
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: PRIMARY, fontWeight: '600' },
  impactGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  impactCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  impactValue: { fontSize: 18, fontWeight: '700', color: PRIMARY },
  impactLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingRow: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingInfo: { flex: 1, marginRight: 12 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  settingSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 4 },
});
