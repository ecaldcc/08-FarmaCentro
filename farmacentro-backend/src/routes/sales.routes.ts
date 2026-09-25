import { Router } from 'express';
import * as c from '../controllers/sales.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { paramId, requireStepUp } from '../middlewares/stepUp.js';
import { validate } from '../middlewares/validate.js';
import { IdParams } from '../validation/common.js';
import {
  CreateCustomerBody,
  LookupCustomerQuery,
  UpdateCustomerBody,
  WithdrawConsentBody,
} from '../validation/customer.schemas.js';
import {
  CancelPrescriptionBody,
  CreatePrescriptionBody,
  DispenseBody,
  ListPrescriptionsQuery,
} from '../validation/prescription.schemas.js';
import { BillingLookupQuery, CreateSaleBody, ListSalesQuery, VoidSaleBody } from '../validation/sales.schemas.js';

export const salesRouter = Router();
salesRouter.use(requireAuth());
salesRouter.post('/', requireRole('regente', 'cajero'), validate({ body: CreateSaleBody }), c.createSale);
salesRouter.get('/', requireRole('regente', 'cajero'), validate({ query: ListSalesQuery }), c.listSales);
salesRouter.get('/:id', requireRole('regente', 'cajero'), validate({ params: IdParams }), c.getSale);
salesRouter.post(
  '/:id/void',
  requireRole('regente'),
  validate({ params: IdParams, body: VoidSaleBody }),
  requireStepUp('sale.void', paramId),
  c.voidSale,
);

// NIT/DPI lookup to prefill the buyer's name on the receipt (audited).
export const billingRouter = Router();
billingRouter.get('/lookup', requireAuth(), requireRole('regente', 'cajero'), validate({ query: BillingLookupQuery }), c.lookupBilling);

export const privacyRouter = Router();
privacyRouter.get('/current', requireAuth(), requireRole('regente', 'cajero'), validate({}), c.privacyNotice);

export const customersRouter = Router();
customersRouter.use(requireAuth(), requireRole('regente', 'cajero'));
customersRouter.get('/lookup', validate({ query: LookupCustomerQuery }), c.lookupCustomer);
customersRouter.post('/', validate({ body: CreateCustomerBody }), c.createCustomer);
customersRouter.get('/:id', validate({ params: IdParams }), c.getCustomer);
customersRouter.patch('/:id', validate({ params: IdParams, body: UpdateCustomerBody }), c.updateCustomer);
customersRouter.post(
  '/:id/consent-withdrawal',
  requireRole('regente'),
  validate({ params: IdParams, body: WithdrawConsentBody }),
  c.withdrawConsent,
);

// Prescriptions are visible only to the Regente (CLAUDE.md module 6).
export const prescriptionsRouter = Router();
prescriptionsRouter.use(requireAuth(), requireRole('regente'));
prescriptionsRouter.get('/', validate({ query: ListPrescriptionsQuery }), c.listPrescriptions);
prescriptionsRouter.get('/:id', validate({ params: IdParams }), c.getPrescription);
prescriptionsRouter.post('/', validate({ body: CreatePrescriptionBody }), c.createPrescription);
prescriptionsRouter.post('/:id/cancel', validate({ params: IdParams, body: CancelPrescriptionBody }), c.cancelPrescription);
prescriptionsRouter.post('/:id/dispense', validate({ params: IdParams, body: DispenseBody }), c.dispense);
