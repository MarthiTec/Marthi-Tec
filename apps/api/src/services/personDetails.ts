import { z } from 'zod';

type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };

const contactList = z.array(z.string().trim().max(120)).max(10).transform((items) => items.filter(Boolean));

/** Campos de cadastro comuns a cliente, fornecedor e vendedor (todos opcionais na edição). */
export const personDetailsSchema = z.object({
  documentType: z.enum(['cpf', 'cnpj']).optional(),
  zipCode: z.string().trim().max(12).optional(),
  street: z.string().trim().max(160).optional(),
  number: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  phones: contactList.optional(),
  emails: contactList.optional(),
  sellerId: z.string().trim().max(80).nullable().optional(),
});
export type PersonDetails = z.infer<typeof personDetailsSchema>;

const COLUMNS: Array<[keyof PersonDetails, string]> = [
  ['documentType', 'document_type'],
  ['zipCode', 'zip_code'],
  ['street', 'street'],
  ['number', 'number'],
  ['complement', 'complement'],
  ['district', 'district'],
  ['city', 'city'],
  ['state', 'state'],
];

/**
 * Grava endereço, tipo de pessoa e telefones/e-mails extras de um cadastro. Só mexe no que veio
 * preenchido; o vendedor do cliente precisa ser da mesma loja.
 */
export async function savePersonDetails(
  db: Queryable,
  table: 'customers' | 'suppliers' | 'sellers',
  id: string,
  storeId: string,
  input: PersonDetails,
) {
  const details = { ...input, district: input.district ?? input.neighborhood };
  const sets: string[] = [];
  const args: unknown[] = [id, storeId];
  const push = (column: string, value: unknown) => {
    args.push(value);
    sets.push(`${column} = $${args.length}`);
  };
  for (const [key, column] of COLUMNS) {
    const value = details[key];
    if (value !== undefined) push(column, key === 'state' ? String(value).toUpperCase() : value);
  }
  if (details.phones !== undefined) push('extra_phones', JSON.stringify(details.phones));
  if (details.emails !== undefined) push('extra_emails', JSON.stringify(details.emails));
  if (table === 'customers' && details.sellerId !== undefined) {
    const sellerId = details.sellerId || null;
    if (sellerId && !(await db.query('SELECT 1 FROM sellers WHERE id = $1 AND store_id = $2', [sellerId, storeId])).rows.length) {
      throw Object.assign(new Error('Vendedor não encontrado nesta loja.'), { status: 400 });
    }
    push('seller_id', sellerId);
  }
  if (!sets.length) return;
  await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND store_id = $2`, args);
}

const list = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);

/** Mesmos campos no formato da tela (camelCase), a partir da linha do banco. */
export function personDetailsFromRow(row: Record<string, any>) {
  return {
    documentType: row.document_type === 'cnpj' ? 'cnpj' : 'cpf',
    zipCode: row.zip_code ?? '',
    street: row.street ?? '',
    number: row.number ?? '',
    complement: row.complement ?? '',
    district: row.district ?? '',
    neighborhood: row.district ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    phones: list(row.extra_phones),
    emails: list(row.extra_emails),
    ...(row.seller_id !== undefined ? { sellerId: row.seller_id ?? '' } : {}),
  };
}
