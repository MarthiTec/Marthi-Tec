/** Dados públicos da sede Marthi — site, painel e canais. */

export const MARTHI_COMPANY = {
  legalName: 'Marthi Tecnologia',
  city: 'Três Rios',
  state: 'Rio de Janeiro',
  stateUf: 'RJ',
  district: 'Centro',
  venue: 'Shopping Olga Sola',
  addressLine: 'Shopping Olga Sola · Centro · Três Rios — RJ',
  email: 'marthi.tecnologia@gmail.com',
  emailHref: 'mailto:marthi.tecnologia@gmail.com',
  instagramHandle: 'marthi.tecnologia',
  instagramHref: 'https://instagram.com/marthi.tecnologia',
  whatsappDisplay: '(24) 98124-4253',
  whatsappE164: '5524981244253',
  whatsappHref: 'https://wa.me/5524981244253',
} as const;

export function marthiWhatsAppHref(text?: string) {
  if (!text?.trim()) return MARTHI_COMPANY.whatsappHref;
  return `${MARTHI_COMPANY.whatsappHref}?text=${encodeURIComponent(text)}`;
}
