import { createCustomer, type Customer } from '../data/adminStore';
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf } from '../utils/documentUtils';
import { AddressFields, EMPTY_ADDRESS, PersonTypeField, type AddressValue, type DocumentType } from './PersonFields';

/**
 * Cadastro rápido de cliente, igual em todas as telas (venda externa, PDV, OS, financeiro):
 * os dados da ficha de venda da loja — nome, CPF/CNPJ, RG, telefone, e-mail e endereço com busca pelo CEP.
 */
export type CustomerDraft = {
  documentType: DocumentType;
  document: string;
  name: string;
  rg: string;
  phone: string;
  email: string;
  address: AddressValue;
};

export function emptyCustomerDraft(initial: { name?: string; phone?: string; document?: string; email?: string } = {}): CustomerDraft {
  const digits = (initial.document ?? '').replace(/\D/g, '');
  const documentType: DocumentType = digits.length > 11 ? 'cnpj' : 'cpf';
  return {
    documentType,
    document: digits ? (documentType === 'cnpj' ? formatCnpj(digits) : formatCpf(digits)) : '',
    name: initial.name ?? '',
    rg: '',
    phone: formatPhone(initial.phone ?? ''),
    email: initial.email ?? '',
    address: EMPTY_ADDRESS,
  };
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Mensagem do primeiro problema do cadastro, ou '' quando dá para salvar. */
export function customerDraftError(draft: CustomerDraft, requireDocument = false) {
  const isCompany = draft.documentType === 'cnpj';
  if (!draft.name.trim()) return isCompany ? 'Informe a razão social.' : 'Informe o nome do cliente.';
  const digits = draft.document.replace(/\D/g, '');
  if (!digits) return requireDocument ? `Informe o ${isCompany ? 'CNPJ' : 'CPF'} do cliente.` : '';
  if (isCompany ? !isValidCnpj(digits) : !isValidCpf(digits)) return `${isCompany ? 'CNPJ' : 'CPF'} inválido.`;
  return '';
}

/** Grava no banco e devolve o cliente já pronto para selecionar na tela. */
export async function saveCustomerDraft(draft: CustomerDraft, requireDocument = false): Promise<Customer> {
  const problem = customerDraftError(draft, requireDocument);
  if (problem) throw new Error(problem);
  const { address } = draft;
  return createCustomer({
    name: draft.name.trim(),
    documentType: draft.documentType,
    document: draft.document.trim(),
    rg: draft.documentType === 'cpf' ? draft.rg.trim() : '',
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    zipCode: address.zipCode.trim(),
    street: address.street.trim(),
    number: address.number.trim(),
    complement: address.complement.trim(),
    neighborhood: address.district.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
    active: true,
  });
}

export function CustomerQuickFields({
  value,
  onChange,
  requireDocument = false,
}: {
  value: CustomerDraft;
  onChange: (value: CustomerDraft) => void;
  requireDocument?: boolean;
}) {
  const isCompany = value.documentType === 'cnpj';
  const set = (patch: Partial<CustomerDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="customer-quick">
      <PersonTypeField type={value.documentType} document={value.document} onChange={(documentType, document) => set({ documentType, document })} />
      <label className="customer-quick__wide">
        {isCompany ? 'Razão social *' : 'Nome completo *'}
        <input value={value.name} maxLength={160} autoFocus onChange={(event) => set({ name: event.target.value })} />
      </label>
      {requireDocument ? <small className="customer-quick__wide customer-quick__hint">{isCompany ? 'CNPJ' : 'CPF'} obrigatório nesta tela.</small> : null}
      {!isCompany ? (
        <label>
          RG
          <input value={value.rg} maxLength={30} onChange={(event) => set({ rg: event.target.value })} />
        </label>
      ) : null}
      <label>
        Telefone / WhatsApp
        <input value={value.phone} inputMode="tel" placeholder="(00) 00000-0000" onChange={(event) => set({ phone: formatPhone(event.target.value) })} />
      </label>
      <label className={isCompany ? '' : 'customer-quick__wide'}>
        E-mail
        <input value={value.email} type="email" maxLength={160} placeholder="opcional" onChange={(event) => set({ email: event.target.value })} />
      </label>
      <AddressFields value={value.address} onChange={(address) => set({ address })} />
    </div>
  );
}
