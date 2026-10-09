import { nestGet, nestPost, nestPut } from './nestClient';

/** Contatos de suporte da Marthi e pedidos de ajuste da loja — tudo no banco. */
export type SupportContacts = {
  email: string;
  instagram: string;
  instagramUrl: string;
  whatsapp: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  address: string;
};

export type SupportTicket = {
  id: string;
  topic: string;
  message: string;
  status: string;
  userName: string;
  userEmail: string;
  createdAt: string;
};

export const apiGetSupportContacts = () => nestGet<SupportContacts>('/support/contacts');
export const apiSaveSupportContacts = (body: { email: string; instagram: string; whatsapp: string; address: string }) =>
  nestPut<SupportContacts>('/support/contacts', body);
export const apiListSupportTickets = () => nestGet<SupportTicket[]>('/support/tickets');
export const apiCreateSupportTicket = (body: { topic: string; message: string }) => nestPost<SupportTicket>('/support/tickets', body);
