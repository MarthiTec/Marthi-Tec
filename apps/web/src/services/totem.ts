const API_URL = import.meta.env.VITE_API_URL ?? '';

export type TotemLeadRequest = {
  customerName: string;
  customerPhone: string;
  productName: string;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
};

export async function submitTotemLead(payload: TotemLeadRequest): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1/totem/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as {
    success: boolean;
    error?: { message?: string };
  };

  if (!response.ok || !json.success) {
    throw new Error(json.error?.message ?? `Falha ao enviar lead (${response.status})`);
  }
}
