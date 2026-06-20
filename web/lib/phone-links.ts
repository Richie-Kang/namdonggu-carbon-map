import { normalizeKoreanLocalPhone } from './action-providers';

export function telHref(phone: string): string {
  return `tel:${normalizeKoreanLocalPhone(phone)}`;
}

export function smsHref(phone: string, body: string): string {
  return `sms://${normalizeKoreanLocalPhone(phone)}?body=${encodeURIComponent(body)}`;
}
