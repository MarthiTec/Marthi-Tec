export type HealthPayload = {
  service: string;
  status: string;
  time: string;
  database: {
    configured: boolean;
    connected: boolean;
    error: string | null;
  };
};

const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function getHealth(): Promise<HealthPayload> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error(`API respondeu ${response.status}`);
  }

  const json = (await response.json()) as {
    success: boolean;
    data: HealthPayload;
  };

  return json.data;
}
