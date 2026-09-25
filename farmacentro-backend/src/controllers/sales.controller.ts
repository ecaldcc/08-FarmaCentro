import type { Request, Response } from 'express';
import { input } from '../middlewares/validate.js';
import { lookupBillingParty } from '../services/billing.service.js';
import * as customers from '../services/customer.service.js';
import * as prescriptions from '../services/prescription.service.js';
import * as sales from '../services/sale.service.js';
import { consumeStepUp } from '../services/stepUp.service.js';
import { Errors } from '../utils/httpError.js';
import { auditContext } from '../utils/requestContext.js';
import type {
  CreateCustomerInput,
  LookupCustomerInput,
  UpdateCustomerInput,
  WithdrawConsentInput,
} from '../validation/customer.schemas.js';
import type {
  CreatePrescriptionInput,
  DispenseInput,
  ListPrescriptionsInput,
} from '../validation/prescription.schemas.js';
import type {
  BillingLookupInput,
  CreateSaleInput,
  ListSalesInput,
  VoidSaleInput,
} from '../validation/sales.schemas.js';

type IdParams = { id: string };

function actor(req: Request) {
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
}

// ------------------------------------------------------------------------------------ sales

export async function createSale(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, CreateSaleInput>(req);
  res.status(201).json(await sales.createSale(body, actor(req).id, auditContext(req)));
}

export async function listSales(req: Request, res: Response): Promise<void> {
  res.json(await sales.listSales(input<unknown, ListSalesInput>(req).query, actor(req)));
}

export async function getSale(req: Request, res: Response): Promise<void> {
  res.json(await sales.getSale(input<IdParams>(req).params.id, actor(req), auditContext(req)));
}

export async function voidSale(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, VoidSaleInput>(req);
  res.json(
    await sales.voidSale(params.id, body.reason, actor(req).id, auditContext(req), res.locals.stepUpMethod ?? 'unknown'),
  );
}

export async function lookupBilling(req: Request, res: Response): Promise<void> {
  const { query } = input<unknown, BillingLookupInput>(req);
  res.json(await lookupBillingParty(query.type, query.taxId, auditContext(req)));
}

// -------------------------------------------------------------------------------- customers

export function privacyNotice(_req: Request, res: Response): void {
  res.json(customers.privacyNotice());
}

export async function lookupCustomer(req: Request, res: Response): Promise<void> {
  res.json(await customers.lookupCustomer(input<unknown, LookupCustomerInput>(req).query));
}

export async function createCustomer(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, CreateCustomerInput>(req);
  res.status(201).json(await customers.createCustomer(body, actor(req).id, auditContext(req)));
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  res.json(await customers.getCustomer(input<IdParams>(req).params.id, auditContext(req)));
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, UpdateCustomerInput>(req);
  res.json(await customers.updateCustomer(params.id, body, auditContext(req)));
}

export async function withdrawConsent(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, WithdrawConsentInput>(req);
  await customers.withdrawConsent(params.id, body.reason, auditContext(req));
  res.status(204).end();
}

// ---------------------------------------------------------------------------- prescriptions

export async function listPrescriptions(req: Request, res: Response): Promise<void> {
  res.json(await prescriptions.listPrescriptions(input<unknown, ListPrescriptionsInput>(req).query));
}

export async function getPrescription(req: Request, res: Response): Promise<void> {
  res.json(await prescriptions.getPrescription(input<IdParams>(req).params.id, auditContext(req)));
}

export async function createPrescription(req: Request, res: Response): Promise<void> {
  const { body } = input<unknown, unknown, CreatePrescriptionInput>(req);
  res.status(201).json(await prescriptions.createPrescription(body, actor(req).id, auditContext(req)));
}

export async function cancelPrescription(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, WithdrawConsentInput>(req);
  await prescriptions.cancelPrescription(params.id, body.reason, actor(req).id, auditContext(req));
  res.status(204).end();
}

/** Step-up is required only when a controlled medicine is dispensed. */
export async function dispense(req: Request, res: Response): Promise<void> {
  const { params, body } = input<IdParams, unknown, DispenseInput>(req);
  let stepUpMethod: string | null = null;
  if (await prescriptions.dispensationRequiresStepUp(body)) {
    stepUpMethod = consumeStepUp(req, 'prescription.dispense', params.id);
  }
  res
    .status(201)
    .json(await prescriptions.dispensePrescription(params.id, body, actor(req).id, auditContext(req), stepUpMethod));
}
