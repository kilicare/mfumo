import { create } from 'zustand';
import { getApiError } from '@/lib/api';
import {
  salesAPI,
  type CreateSalesInvoiceInput,
  type CreateSalesReturnInput,
  type Customer,
  type SalesInvoice,
  type SalesInvoiceFilters,
  type SalesReturn,
  type SalesReturnFilters,
} from '@/lib/api/sales';

interface SalesState {
  invoices: SalesInvoice[];
  returns: SalesReturn[];
  customers: Customer[];
  selectedInvoice: SalesInvoice | null;
  selectedReturn: SalesReturn | null;
  total: number;
  page: number;
  limit: number;
  isLoading: boolean;
  error: string | null;
  fetchInvoices: (filters?: SalesInvoiceFilters) => Promise<void>;
  fetchInvoice: (id: string) => Promise<SalesInvoice>;
  createInvoice: (input: CreateSalesInvoiceInput) => Promise<SalesInvoice>;
  updateInvoice: (id: string, input: Partial<CreateSalesInvoiceInput>) => Promise<SalesInvoice>;
  issueInvoice: (id: string) => Promise<SalesInvoice>;
  cancelInvoice: (id: string, reason: string) => Promise<SalesInvoice>;
  recordPayment: (id: string, input: { amount: number; paymentMethodId: string; paymentDate?: string; reference?: string; notes?: string }, idempotencyKey: string) => Promise<SalesInvoice>;
  fetchReturns: (filters?: SalesReturnFilters) => Promise<void>;
  fetchReturn: (id: string) => Promise<SalesReturn>;
  createReturn: (input: CreateSalesReturnInput) => Promise<SalesReturn>;
  authorizeReturn: (id: string) => Promise<SalesReturn>;
  receiveReturn: (id: string) => Promise<SalesReturn>;
  rejectReturn: (id: string, reason: string) => Promise<SalesReturn>;
  fetchCustomers: () => Promise<void>;
  clearError: () => void;
}

function message(error: unknown, fallback: string) {
  return getApiError(error, fallback);
}

export const useSalesStore = create<SalesState>((set, get) => ({
  invoices: [], returns: [], customers: [], selectedInvoice: null, selectedReturn: null,
  total: 0, page: 1, limit: 20, isLoading: false, error: null,
  fetchInvoices: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const result = await salesAPI.invoices(filters);
      set({ invoices: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (error) {
      set({ invoices: [], total: 0, error: message(error, 'Could not load invoices.') });
      throw error;
    } finally { set({ isLoading: false }); }
  },
  fetchInvoice: async (id) => {
    set({ isLoading: true, error: null, selectedInvoice: null });
    try {
      const invoice = await salesAPI.invoice(id);
      set((state) => ({ selectedInvoice: invoice, invoices: state.invoices.map((row) => row.id === id ? invoice : row) }));
      return invoice;
    } catch (error) {
      set({ error: message(error, 'Could not load this invoice.') });
      throw error;
    } finally { set({ isLoading: false }); }
  },
  createInvoice: async (input) => {
    set({ isLoading: true, error: null });
    try { return await salesAPI.createInvoice(input); }
    catch (error) { set({ error: message(error, 'Could not create the invoice.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  updateInvoice: async (id, input) => {
    set({ isLoading: true, error: null });
    try {
      const invoice = await salesAPI.updateInvoice(id, input);
      set((state) => ({ selectedInvoice: invoice, invoices: state.invoices.map((row) => row.id === id ? invoice : row) }));
      return invoice;
    } catch (error) { set({ error: message(error, 'Could not update the invoice.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  issueInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const invoice = await salesAPI.issueInvoice(id);
      set((state) => ({ selectedInvoice: invoice, invoices: state.invoices.map((row) => row.id === id ? invoice : row) }));
      return invoice;
    } catch (error) { set({ error: message(error, 'Could not issue the invoice.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  cancelInvoice: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const invoice = await salesAPI.cancelInvoice(id, reason);
      set((state) => ({ selectedInvoice: invoice, invoices: state.invoices.map((row) => row.id === id ? invoice : row) }));
      return invoice;
    } catch (error) { set({ error: message(error, 'Could not cancel the invoice.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  recordPayment: async (id, input, idempotencyKey) => {
    set({ isLoading: true, error: null });
    try {
      await salesAPI.recordPayment(id, input, idempotencyKey);
      return await get().fetchInvoice(id);
    } catch (error) { set({ error: message(error, 'Could not record the payment.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  fetchReturns: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const result = await salesAPI.returns(filters);
      set({ returns: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (error) { set({ returns: [], total: 0, error: message(error, 'Could not load sales returns.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  fetchReturn: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const item = await salesAPI.salesReturn(id);
      set({ selectedReturn: item });
      return item;
    } catch (error) { set({ error: message(error, 'Could not load this return.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  createReturn: async (input) => {
    set({ isLoading: true, error: null });
    try { return await salesAPI.createReturn(input); }
    catch (error) { set({ error: message(error, 'Could not create the return.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  authorizeReturn: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const item = await salesAPI.authorizeReturn(id);
      set((state) => ({ selectedReturn: item, returns: state.returns.map((row) => row.id === id ? item : row) }));
      return item;
    } catch (error) { set({ error: message(error, 'Could not authorize the return.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  receiveReturn: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const item = await salesAPI.receiveReturn(id);
      set((state) => ({ selectedReturn: item, returns: state.returns.map((row) => row.id === id ? item : row) }));
      try {
        const invoice = await salesAPI.invoice(item.salesInvoiceId);
        set((state) => ({
          selectedInvoice: state.selectedInvoice?.id === invoice.id ? invoice : state.selectedInvoice,
          invoices: state.invoices.map((row) => row.id === invoice.id ? invoice : row),
        }));
      } catch {
        set({ error: 'Return was received, but the related invoice could not be refreshed. Reopen the invoice to load its current balance.' });
      }
      return item;
    } catch (error) { set({ error: message(error, 'Could not receive the return.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  rejectReturn: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const item = await salesAPI.rejectReturn(id, reason);
      set((state) => ({ selectedReturn: item, returns: state.returns.map((row) => row.id === id ? item : row) }));
      return item;
    } catch (error) { set({ error: message(error, 'Could not reject the return.') }); throw error; }
    finally { set({ isLoading: false }); }
  },
  fetchCustomers: async () => {
    set({ error: null });
    try { set({ customers: await salesAPI.customers() }); }
    catch (error) { set({ error: message(error, 'Could not load customers.') }); throw error; }
  },
  clearError: () => set({ error: null }),
}));
