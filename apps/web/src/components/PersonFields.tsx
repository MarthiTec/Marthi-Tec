import { useEffect, useId, useRef, useState } from 'react';
import { apiAddressByCep, apiSearchAddress, type ApiAddress } from '../services/erpApi';
import { getActiveStore } from '../data/multiStoreStore';
import { formatCnpj, formatCpf } from '../utils/documentUtils';
import './personFields.css';

export type DocumentType = 'cpf' | 'cnpj';

export type AddressValue = {
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

export const EMPTY_ADDRESS: AddressValue = { zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' };

const formatZip = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};

/** Pessoa física ou jurídica: o campo do documento vira CPF ou CNPJ, com a máscara certa. */
export function PersonTypeField({
  type,
  document,
  disabled,
  onChange,
}: {
  type: DocumentType;
  document: string;
  disabled?: boolean;
  onChange: (type: DocumentType, document: string) => void;
}) {
  const isCompany = type === 'cnpj';
  return (
    <div className="person-type span-2">
      <div className="person-type__switch" role="radiogroup" aria-label="Tipo de pessoa">
        {(['cpf', 'cnpj'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={type === option}
            disabled={disabled}
            className={type === option ? 'is-active' : ''}
            onClick={() => onChange(option, option === 'cnpj' ? formatCnpj(document) : formatCpf(document))}
          >
            {option === 'cpf' ? 'Pessoa física' : 'Pessoa jurídica'}
          </button>
        ))}
      </div>
      <label>
        {isCompany ? 'CNPJ' : 'CPF'}
        <input
          value={document}
          disabled={disabled}
          inputMode={isCompany ? 'text' : 'numeric'}
          placeholder={isCompany ? '00.000.000/0000-00' : '000.000.000-00'}
          onChange={(event) => onChange(type, isCompany ? formatCnpj(event.target.value) : formatCpf(event.target.value))}
        />
      </label>
    </div>
  );
}

/** Contato principal e quantos outros a pessoa tiver (telefones ou e-mails). */
export function ContactListField({
  kind,
  primary,
  extras,
  disabled,
  onChange,
}: {
  kind: 'phone' | 'email';
  primary: string;
  extras: string[];
  disabled?: boolean;
  onChange: (primary: string, extras: string[]) => void;
}) {
  const isPhone = kind === 'phone';
  const inputProps = isPhone
    ? { type: 'tel', inputMode: 'tel' as const, placeholder: '(00) 00000-0000' }
    : { type: 'email', inputMode: 'email' as const, placeholder: 'nome@email.com' };
  return (
    <div className="contact-list">
      <label>
        {isPhone ? 'Telefone / WhatsApp' : 'E-mail'}
        <input {...inputProps} value={primary} disabled={disabled} onChange={(event) => onChange(event.target.value, extras)} />
      </label>
      {extras.map((value, index) => (
        <div key={index} className="contact-list__row">
          <input
            {...inputProps}
            aria-label={`${isPhone ? 'Outro telefone' : 'Outro e-mail'} ${index + 1}`}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(primary, extras.map((item, i) => (i === index ? event.target.value : item)))}
          />
          {!disabled ? (
            <button
              type="button"
              className="contact-list__remove"
              aria-label={`Remover ${isPhone ? 'telefone' : 'e-mail'} ${index + 1}`}
              onClick={() => onChange(primary, extras.filter((_, i) => i !== index))}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      {!disabled && extras.length < 9 ? (
        <button type="button" className="contact-list__add" onClick={() => onChange(primary, [...extras, ''])}>
          + Outro {isPhone ? 'telefone' : 'e-mail'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Endereço completo. Dá para buscar pelo CEP ou ir digitando o nome da rua (na cidade da loja,
 * que pode ser trocada): ao escolher a sugestão, CEP, bairro, cidade e estado já vêm preenchidos.
 */
export function AddressFields({
  value,
  disabled,
  onChange,
}: {
  value: AddressValue;
  disabled?: boolean;
  onChange: (value: AddressValue) => void;
}) {
  const store = getActiveStore();
  const [searchCity, setSearchCity] = useState(value.city || store?.city || '');
  const [searchUf, setSearchUf] = useState(value.state || store?.state || '');
  const [street, setStreet] = useState('');
  const [results, setResults] = useState<ApiAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [cepBusy, setCepBusy] = useState(false);
  const listId = useId();
  const lastCep = useRef('');

  function apply(address: ApiAddress) {
    onChange({
      ...value,
      zipCode: address.zipCode || value.zipCode,
      street: address.street || value.street,
      district: address.district || value.district,
      city: address.city || value.city,
      state: address.state || value.state,
    });
    setResults([]);
    setStreet('');
    setMessage('');
  }

  // Busca pela rua enquanto digita (espera a pessoa parar de digitar).
  useEffect(() => {
    const term = street.trim();
    if (disabled || term.length < 3 || searchCity.trim().length < 3 || searchUf.trim().length !== 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void apiSearchAddress({ uf: searchUf.trim().toUpperCase(), city: searchCity.trim(), street: term })
        .then((rows) => {
          if (!alive) return;
          setResults(rows);
          setMessage(rows.length ? '' : 'Nenhuma rua encontrada com esse nome nesta cidade.');
        })
        .catch((err) => alive && setMessage(err instanceof Error ? err.message : 'Não foi possível buscar agora.'))
        .finally(() => alive && setSearching(false));
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [street, searchCity, searchUf, disabled]);

  async function lookupCep(zip: string) {
    const digits = zip.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastCep.current) return;
    lastCep.current = digits;
    setCepBusy(true);
    setMessage('');
    try {
      apply(await apiAddressByCep(digits));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'CEP não encontrado.');
    } finally {
      setCepBusy(false);
    }
  }

  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="address-fields span-2" disabled={disabled}>
      <legend>Endereço</legend>
      {!disabled ? (
        <div className="address-search">
          <label className="address-search__street">
            Buscar pelo nome da rua
            <input
              value={street}
              placeholder="Comece a digitar a rua…"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              onChange={(event) => setStreet(event.target.value)}
            />
          </label>
          <label className="address-search__city">
            Cidade
            <input value={searchCity} onChange={(event) => setSearchCity(event.target.value)} />
          </label>
          <label className="address-search__uf">
            UF
            <input value={searchUf} maxLength={2} onChange={(event) => setSearchUf(event.target.value.toUpperCase())} />
          </label>
          {results.length ? (
            <ul className="address-search__results" id={listId} role="listbox">
              {results.map((row) => (
                <li key={`${row.zipCode}-${row.street}-${row.district}`} role="option" aria-selected={false}>
                  <button type="button" onClick={() => apply(row)}>
                    <strong>{row.street}</strong>
                    <span>
                      {[row.district, `${row.city}/${row.state}`, row.zipCode, row.complement].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {searching ? <small className="address-search__hint">Buscando…</small> : null}
        </div>
      ) : null}
      {message ? <small className="address-search__hint" role="status">{message}</small> : null}
      <div className="address-fields__grid">
        <label className="addr-cep">
          CEP {cepBusy ? <small>buscando…</small> : null}
          <input
            value={value.zipCode}
            inputMode="numeric"
            placeholder="00000-000"
            onChange={(event) => {
              const zipCode = formatZip(event.target.value);
              set({ zipCode });
              void lookupCep(zipCode);
            }}
          />
        </label>
        <label className="addr-street">
          Rua / logradouro
          <input value={value.street} onChange={(event) => set({ street: event.target.value })} />
        </label>
        <label className="addr-number">
          Número
          <input value={value.number} onChange={(event) => set({ number: event.target.value })} />
        </label>
        <label className="addr-complement">
          Complemento
          <input value={value.complement} onChange={(event) => set({ complement: event.target.value })} />
        </label>
        <label className="addr-district">
          Bairro
          <input value={value.district} onChange={(event) => set({ district: event.target.value })} />
        </label>
        <label className="addr-city">
          Cidade
          <input value={value.city} onChange={(event) => set({ city: event.target.value })} />
        </label>
        <label className="addr-uf">
          UF
          <input value={value.state} maxLength={2} onChange={(event) => set({ state: event.target.value.toUpperCase() })} />
        </label>
      </div>
    </fieldset>
  );
}
