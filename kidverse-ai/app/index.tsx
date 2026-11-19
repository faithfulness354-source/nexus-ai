import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ParentGateModal } from '@/components/ParentGateModal';
import { ProfileCard } from '@/components/ProfileCard';
import { useProfiles } from '@/contexts/ProfilesContext';

export default function KidVerseLauncher() {
  const { profiles, loading, unlockParent } = useProfiles();
  const [gateOpen, setGateOpen] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#ECFDF5', '#E0F2FE', '#FEF9C3']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setGateOpen(true)}
            style={styles.parentBtn}
            accessibilityLabel="Open Parent Gate"
          >
            <Text style={styles.parentBtnText}>Parent</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>KidVerse AI</Text>
          <Text style={styles.tagline}>
            A parent-managed launcher for StorySprout, RealmHopper, and FableForge.
          </Text>

          <Text style={styles.section}>Choose a kid profile</Text>
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onPress={() =>
                router.push({
                  pathname: '/realm/[tier]',
                  params: { tier: profile.age_tier, kidId: profile.id },
                })
              }
            />
          ))}

          <Text style={styles.footnote}>
            COPPA-ready preview: nicknames & avatars only — no emails, birthdates, or photos.
          </Text>
        </ScrollView>
      </SafeAreaView>

      <ParentGateModal
        visible={gateOpen}
        onClose={() => setGateOpen(false)}
        verifyPin={unlockParent}
        onSuccess={() => {
          setGateOpen(false);
          router.push('/parent');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  parentBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  parentBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  brand: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0F766E',
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
    maxWidth: 420,
  },
  section: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  footnote: {
    marginTop: 18,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
});
