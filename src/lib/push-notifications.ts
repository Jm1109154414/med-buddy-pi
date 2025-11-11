import { supabase } from "@/integrations/supabase/client";

export type PushSub = PushSubscription | null;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function registerPush(publicVapidKey: string): Promise<PushSub> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const reg = await navigator.serviceWorker.register('/sw.js');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return null;

  const appServerKey = urlBase64ToUint8Array(publicVapidKey);
  const sub = await reg.pushManager.subscribe({ 
    userVisibleOnly: true, 
    applicationServerKey: appServerKey 
  });

  // Save to backend
  await supabase.functions.invoke('push-subscribe', {
    body: { subscription: sub.toJSON() }
  });

  return sub;
}

export async function unregisterPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if (sub) {
    await sub.unsubscribe();
    return true;
  }

  return false;
}

export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  return !!sub;
}
