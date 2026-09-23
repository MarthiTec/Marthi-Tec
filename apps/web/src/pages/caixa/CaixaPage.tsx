import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { UserChip } from '../../components/UserChip';
import { OperatorProfilePanel } from '../../components/OperatorProfilePanel';
import { useAuth } from '../../contexts/AuthContext';
import {
  applyPriceTable,
  attachOrderCashSession,
  closePosSale,
  findStockByCode,
  findStockMatches,
  getAdminState,
  isWeighedUnit,
  normalizeSaleQty,
  stockItemImages,
  type Customer,
  type StockItem,
  type StockUnit,
} from '../../data/adminStore';
import {
  getOpenCashSession,
  openCashDrawer,
  registerCashSale,
  type CashSession,
} from '../../data/cashRegisterStore';
import {
  CASH_SETTINGS_EVENT,
  getCashSettings,
  readScaleKg,
  verifyDeleteItemPassword,
} from '../../data/cashSettings';
import { listSellers, userIsStoreAdmin } from '../../data/erpRegistry';
import {
  applyTierTotal,
  findCampaignsForStock,
  PROMO_EVENT,
} from '../../data/promoCampaignStore';
import { emitNfeFromSale, emitSaleCheckoutDocument, FISCAL_KIND_LABEL } from '../../data/fiscalDocuments';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { hasModule } from '../../data/storePlan';
import { getTotemSettings } from '../../data/totemSettings';
import { enqueueKitchenOrder } from '../../data/kitchenOrderStore';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import { CaixaPanelHost, type CaixaPanel } from './CaixaPanels';
import { CaixaPaymentSplit } from './CaixaPaymentSplit';
import {
  createSplit,
  describeSplit,
  isVoucherPayment,
  roundMoney,
  summarizeSplit,
  syncSingleSplit,
  type SplitPayment,
} from './paymentSplit';
import '../admin/admin.css';
import './caixa.css';

const CONSUMIDOR_FINAL = 'Consumidor Final';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  if (dig !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  return dig === Number(cpf[10]);
}

type MoneyMode = 'money' | 'percent';

type CartLine = {
  key: string;
  stockId: string;
  name: string;
  sku: string;
  imei: string;
  qty: number;
  unit: StockUnit;
  basePrice: number;
  unitPrice: number;
  priceTableId: string;
  lineDiscount: number;
  lineDiscountMode: MoneyMode;
  lineSurcharge: number;
  lineSurchargeMode: MoneyMode;
  /** Campanha aplicada (faixa / brinde). */
  promoLabel?: string;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
