import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleAlert } from '../components/icons';
import { Segmented } from '../components/chrome';
import { Button, Icon, Text } from '../components/primitives';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { borderWidth, color, layout, radius, space, text } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

function Field({ label, hint, ...props }: React.ComponentProps<typeof TextInput> & { label: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="meta">{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={hint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={color.fg}
        cursorColor={color.fg}
        placeholderTextColor={color.fgSubtle}
        style={[styles.input, { borderColor: focused ? color.borderStrong : color.border, borderWidth: focused ? borderWidth.strong : borderWidth.hairline }]}
      />
      {hint ? (
        <Text variant="meta" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Optional sign in / create account. An account only syncs saved stories. */
export function AccountScreen({ navigation }: Props) {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= (mode === 'register' ? 10 : 1);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await auth.login(email.trim(), password);
      else await auth.register(email.trim(), password);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Text variant="display" accessibilityRole="header">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </Text>
          <Text variant="body" tone="muted">
            Optional. An account keeps your saved stories in sync across devices.
          </Text>
          <Segmented
            options={[
              { key: 'login', label: 'Sign in' },
              { key: 'register', label: 'Create account' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
          />
          <View style={{ gap: space[5], marginTop: space[2] }}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
            <Field
              label="Password"
              hint={mode === 'register' ? 'At least 10 characters.' : undefined}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          </View>
          {error ? (
            <View style={styles.error} accessibilityLiveRegion="assertive">
              <Icon as={CircleAlert} size={18} />
              <Text variant="bodySmall" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          ) : null}
          <Button size="lg" label={mode === 'login' ? 'Sign in' : 'Create account'} onPress={() => void submit()} disabled={!valid} loading={busy} style={{ marginTop: space[2] }} />
          <Text variant="meta" tone="subtle" style={{ textAlign: 'center' }}>
            We store your email and a hashed password. Nothing else.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space[12] },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[4], gap: space[4] },
  input: { ...text.body, fontSize: 17, color: color.fg, minHeight: 52, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: color.bg },
  error: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start', padding: space[4], borderWidth: borderWidth.hairline, borderColor: color.fg, borderRadius: radius.md },
});
