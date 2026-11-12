import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface ParentGateModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  verifyPin: (pin: string) => boolean;
}

export function ParentGateModal({
  visible,
  onClose,
  onSuccess,
  verifyPin,
}: ParentGateModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (verifyPin(pin)) {
      setPin('');
      setError('');
      onSuccess();
      return;
    }
    setError('That PIN didn’t work. Try again.');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Parent Gate</Text>
          <Text style={styles.body}>
            Enter the parent PIN to open the dashboard. Kids stay in their Realms.
          </Text>
          <TextInput
            value={pin}
            onChangeText={(v) => {
              setPin(v.replace(/[^0-9]/g, '').slice(0, 6));
              setError('');
            }}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="PIN"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            maxLength={6}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.hint}>Demo PIN: 1234</Text>
          <View style={styles.row}>
            <Pressable onPress={onClose} style={[styles.btn, styles.ghost]}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={[styles.btn, styles.primary]}>
              <Text style={styles.primaryText}>Unlock</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },
  input: {
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#0F172A',
  },
  error: {
    color: '#DC2626',
    fontWeight: '600',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghost: {
    backgroundColor: '#F1F5F9',
  },
  ghostText: {
    color: '#334155',
    fontWeight: '700',
  },
  primary: {
    backgroundColor: '#0F766E',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
