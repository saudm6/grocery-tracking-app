import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { AppState, Keyboard, Linking, Platform, Text } from 'react-native';
import { Action, ErrorMessage } from './form';
import { cameraCode, type CodeInput } from '../data/code';

type Capture = { generation: number } & ({ status: 'idle' | 'requesting' | 'preview' | 'captured' } | { status: 'error'; message: string });
export type CodeScannerHandle = { cancel: () => void };

export function CodeScanner({ label, onCapture, onOpen, disabled, visible = true, ref }: {
  label: string; onCapture: (input: CodeInput) => void; onOpen?: () => void; disabled: boolean; visible?: boolean; ref?: Ref<CodeScannerHandle>;
}) {
  const [capture, setCapture] = useState<Capture>({ status: 'idle', generation: 0 });
  const captureRef = useRef(capture);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const latest = useRef({ visible, disabled, onCapture, onOpen });
  useLayoutEffect(() => { latest.current = { visible, disabled, onCapture, onOpen }; }, [visible, disabled, onCapture, onOpen]);
  const mounted = useRef(true);
  const previewId = useRef(0);
  const [previewSession, setPreviewSession] = useState(0);
  const invalidatePreview = useCallback(() => { previewId.current++; setPreviewSession(previewId.current); }, []);
  const changeCapture = useCallback((next: Capture) => { captureRef.current = next; setCapture(next); }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    setFocused(true);
    return () => { focusedRef.current = false; setFocused(false); invalidatePreview(); };
  }, [invalidatePreview]));
  useLayoutEffect(() => { if (!visible || disabled) invalidatePreview(); }, [visible, disabled, invalidatePreview]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state !== 'active') invalidatePreview();
      else {
        const generation = captureRef.current.generation;
        void refreshPermission().catch(() => {
          if (mounted.current && captureRef.current.generation === generation && captureRef.current.status !== 'captured') changeCapture({ status: 'error', generation, message: 'Could not read camera permission. Your entries are kept. Retry the camera or type the code.' });
        });
      }
    });
    return () => subscription.remove();
  }, [refreshPermission, changeCapture, invalidatePreview]);
  const cancel = useCallback(() => changeCapture({ status: 'idle', generation: captureRef.current.generation + 1 }), [changeCapture]);
  useImperativeHandle(ref, () => ({ cancel }), [cancel]);
  const open = async () => {
    const previous = captureRef.current;
    if (latest.current.disabled || !latest.current.visible || !focusedRef.current || AppState.currentState !== 'active' || previous.status === 'requesting') return;
    latest.current.onOpen?.();
    const generation = captureRef.current.generation + 1;
    changeCapture({ status: 'requesting', generation });
    Keyboard.dismiss();
    try {
      const access = permission?.granted || permission?.canAskAgain === false ? permission : await requestPermission();
      if (!mounted.current || captureRef.current.generation !== generation || captureRef.current.status !== 'requesting') return;
      changeCapture(access?.granted ? { status: 'preview', generation } : { status: 'error', generation, message: 'Camera permission is denied. Your entries are kept. Type the code instead.' });
    } catch {
      if (mounted.current && captureRef.current.generation === generation) changeCapture({ status: 'error', generation, message: 'Could not open the camera. Your entries are kept. Retry or type the code.' });
    }
  };
  const scanned = (result: BarcodeScanningResult) => {
    if (!mounted.current || latest.current.disabled || !latest.current.visible || !focusedRef.current || AppState.currentState !== 'active' || captureRef.current.status !== 'preview' || captureRef.current.generation !== capture.generation || previewId.current !== previewSession) return;
    try {
      const input = cameraCode(result, Platform.OS);
      changeCapture({ status: 'captured', generation: capture.generation });
      latest.current.onCapture(input);
    } catch (failure) {
      changeCapture({ status: 'error', generation: capture.generation, message: failure instanceof Error ? failure.message : 'Could not read this code. Type the code instead.' });
    }
  };
  const preview = visible && focused && appState === 'active' && permission?.granted && !disabled && capture.status === 'preview';
  const openSettings = () => {
    const generation = captureRef.current.generation;
    void Linking.openSettings().catch(() => {
      if (mounted.current && captureRef.current.generation === generation) changeCapture({ status: 'error', generation, message: 'Could not open Settings. Enable camera permission in the app settings, or type the code.' });
    });
  };
  return <>
    {permission === null ? <Text>Camera permission is loading. You can type the code instead.</Text> : null}
    <Action label={capture.status === 'captured' ? 'Retake code' : capture.status === 'requesting' ? 'Requesting camera permission…' : capture.status === 'preview' ? 'Camera open' : capture.status === 'error' ? 'Retry camera' : label} disabled={disabled || capture.status === 'requesting' || capture.status === 'preview' || (!!permission && !permission.granted && !permission.canAskAgain)} onPress={() => { void open(); }} />
    {capture.status === 'error' ? <ErrorMessage message={capture.message} /> : null}
    {permission && !permission.granted && !permission.canAskAgain ? <Action label="Open camera permission settings" disabled={disabled} onPress={openSettings} /> : null}
    {preview ? <CameraView key={capture.generation} style={{ width: '100%', height: 260 }} facing="back" autofocus="on" barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean8', 'ean13', 'qr'] }} onBarcodeScanned={scanned} onMountError={() => {
      if (mounted.current && captureRef.current.generation === capture.generation && previewId.current === previewSession && captureRef.current.status === 'preview') changeCapture({ status: 'error', generation: capture.generation, message: 'The camera preview could not start. Your entries are kept. Retry or type the code.' });
    }} /> : null}
    {capture.status === 'preview' ? <><Text>Point the back camera at a UPC, EAN or QR label. If it is unreadable, close the camera and type the code.</Text><Action label="Close camera" disabled={disabled} onPress={cancel} /></> : null}
  </>;
}
