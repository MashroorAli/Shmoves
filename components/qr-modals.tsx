import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useSocial } from '@/context/social-context';
import { useColors } from '@/hooks/use-colors';

// expo-camera and react-native-qrcode-svg are native modules that require a
// dev-client rebuild after install. We load them lazily so the app starts even
// on a pre-rebuild Expo Go session — the QR screens show a "rebuild needed"
// fallback instead of crashing.
// Metro requires string literals in require() — no dynamic require(variable).

function tryRequireQrCode(): { default: React.ComponentType<{ value: string; size: number }> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-qrcode-svg');
  } catch {
    return null;
  }
}

type CameraModule = {
  CameraView: React.ComponentType<{
    style: any;
    barcodeScannerSettings: { barcodeTypes: string[] };
    onBarcodeScanned: (e: { data: string }) => void;
  }>;
  useCameraPermissions: () => [
    { granted: boolean; canAskAgain: boolean } | null,
    () => Promise<{ granted: boolean }>,
  ];
};

function tryRequireCamera(): CameraModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-camera');
  } catch {
    return null;
  }
}

const FRIEND_LINK = (username: string) => `shmoves://add-friend/${username}`;

// ─── My QR (generate) ────────────────────────────────────────────────────────

export function MyQrModal({
  visible,
  username,
  displayName,
  onClose,
}: {
  visible: boolean;
  username: string | null;
  displayName: string | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const qrMod = tryRequireQrCode();
  const QRCodeComponent = qrMod?.default ?? null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Your QR code</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.centered}>
          {!username ? (
            <ThemedText style={[styles.hint, { color: colors.icon }]}>
              Set a username in your profile first so friends can find you.
            </ThemedText>
          ) : !QRCodeComponent ? (
            <NativeRebuildNotice />
          ) : (
            <>
              <View style={[styles.qrCard, { backgroundColor: '#fff', borderColor: colors.border }]}>
                <QRCodeComponent value={FRIEND_LINK(username)} size={240} />
              </View>
              {displayName ? (
                <ThemedText style={[styles.name, { color: colors.text }]}>{displayName}</ThemedText>
              ) : null}
              <ThemedText style={[styles.username, { color: colors.icon }]}>@{username}</ThemedText>
              <ThemedText style={[styles.hint, { color: colors.icon }]}>
                Have a friend scan this to send you a request.
              </ThemedText>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Scan QR ─────────────────────────────────────────────────────────────────

export function ScanQrModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const cameraMod = tryRequireCamera();

  if (!cameraMod) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Scan friend QR</ThemedText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.centered}>
            <NativeRebuildNotice />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <ScanQrInner
      visible={visible}
      onClose={onClose}
      CameraView={cameraMod.CameraView}
      useCameraPermissions={cameraMod.useCameraPermissions}
    />
  );
}

// Split into inner so the hook is only called when the module is available.
function ScanQrInner({
  visible,
  onClose,
  CameraView,
  useCameraPermissions,
}: {
  visible: boolean;
  onClose: () => void;
  CameraView: React.ComponentType<any>;
  useCameraPermissions: () => [{ granted: boolean; canAskAgain: boolean } | null, () => Promise<{ granted: boolean }>];
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { getProfileByUsername, sendFriendRequest, getRelationship } = useSocial();
  const handledRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  const handleScanned = useCallback(
    async (raw: string) => {
      if (handledRef.current) return;
      handledRef.current = true;

      const username = parseAddFriendUrl(raw);
      if (!username) {
        Alert.alert('Unrecognized code', "That QR code isn't a Shmoves friend link.", [
          { text: 'OK', onPress: () => (handledRef.current = false) },
        ]);
        return;
      }

      setBusy(true);
      try {
        const profile = await getProfileByUsername(username);
        if (!profile) {
          Alert.alert('Not found', `No user with username @${username}.`, [
            { text: 'OK', onPress: () => (handledRef.current = false) },
          ]);
          return;
        }
        const rel = getRelationship(profile.id);
        if (rel === 'self') {
          Alert.alert("That's your own code", '', [{ text: 'OK', onPress: () => (handledRef.current = false) }]);
          return;
        }
        if (rel === 'friends') {
          Alert.alert('Already friends', `You and @${username} are already friends.`, [
            { text: 'OK', onPress: onClose },
          ]);
          return;
        }
        if (rel === 'outgoing') {
          Alert.alert('Already sent', `You've already sent @${username} a request.`, [
            { text: 'OK', onPress: onClose },
          ]);
          return;
        }
        if (rel === 'incoming') {
          Alert.alert(
            'They already asked',
            `@${username} sent you a request. Open Requests to accept.`,
            [{ text: 'OK', onPress: onClose }],
          );
          return;
        }

        Alert.alert(
          'Add friend',
          `Send a friend request to ${profile.name ?? `@${username}`}?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => (handledRef.current = false) },
            {
              text: 'Send',
              onPress: async () => {
                try {
                  await sendFriendRequest(profile.id);
                  onClose();
                } catch (e: any) {
                  Alert.alert('Error', e.message || 'Could not send request.');
                  handledRef.current = false;
                }
              },
            },
          ],
        );
      } finally {
        setBusy(false);
      }
    },
    [getProfileByUsername, getRelationship, onClose, sendFriendRequest],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: '#000', paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <ThemedText style={[styles.title, { color: '#fff' }]}>Scan friend QR</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {!permission ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.centered}>
            <ThemedText style={[styles.hint, { color: '#fff' }]}>
              Shmoves needs camera access to scan QR codes.
            </ThemedText>
            {permission.canAskAgain ? (
              <Pressable
                onPress={requestPermission}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
              >
                <ThemedText style={styles.primaryBtnText}>Grant access</ThemedText>
              </Pressable>
            ) : (
              <ThemedText style={[styles.hint, { color: '#bbb', marginTop: 12 }]}>
                Enable camera access in your phone settings.
              </ThemedText>
            )}
          </View>
        ) : (
          <View style={styles.scannerWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }: { data: string }) => {
                if (!handledRef.current) handleScanned(data);
              }}
            />
            <View style={styles.scanFrame} />
            {busy ? (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            <ThemedText style={[styles.scanHint, { color: '#fff' }]}>
              Point the camera at a friend&apos;s Shmoves QR code.
            </ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Shared notice ───────────────────────────────────────────────────────────

function NativeRebuildNotice() {
  const colors = useColors();
  return (
    <View style={styles.noticeWrap}>
      <Ionicons name="construct-outline" size={36} color={colors.icon} />
      <ThemedText style={[styles.noticeTitle, { color: colors.text }]}>Native build required</ThemedText>
      <ThemedText style={[styles.hint, { color: colors.icon }]}>
        Run{' '}
        <ThemedText style={{ fontWeight: '700', color: colors.text }}>
          npx expo run:ios
        </ThemedText>{' '}
        (or run:android) to link the camera and QR modules, then relaunch.
      </ThemedText>
    </View>
  );
}

function parseAddFriendUrl(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/^shmoves:\/\/add-friend\/([a-z0-9_]+)/i);
  return match ? match[1].toLowerCase() : null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  qrCard: { padding: 20, borderRadius: 16, borderWidth: 1 },
  name: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  username: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  hint: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  primaryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scannerWrap: { flex: 1 },
  scanFrame: {
    position: 'absolute',
    top: '25%',
    left: '15%',
    right: '15%',
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#fff',
    opacity: 0.85,
  },
  scanHint: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    right: 0,
    textAlign: 'center',
    paddingHorizontal: 24,
    fontSize: 14,
    fontWeight: '600',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeWrap: { alignItems: 'center', gap: 10, padding: 8 },
  noticeTitle: { fontSize: 16, fontWeight: '700' },
});
