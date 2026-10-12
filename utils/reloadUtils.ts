import { Product, Category } from '../types';

/**
 * Determines whether a product/category/item is a digital RELOAD (excluding physical RELOAD CARDs and SIMs).
 */
export function isHotReloadProduct(
  product?: Product | null,
  category?: Category | null,
  txDescription: string = '',
  itemProductId: string = ''
): boolean {
  const pName = (product?.name || '').toUpperCase();
  const cName = (category?.name || '').toUpperCase();
  const pId = (itemProductId || product?.id || '').toUpperCase();
  const desc = (txDescription || '').toUpperCase();

  if (cName.includes('CARD') || pName.includes('RELOAD CARD')) return false;
  if (pName.includes('SIM') || cName.includes('SIM') || desc.includes('SIM')) return false;

  return (
    cName.includes('RELOAD') ||
    pName.includes('RELOAD') ||
    pId.includes('RELOAD') ||
    desc.includes('RELOAD') ||
    pName.includes('DIALOG') ||
    pName.includes('MOBITEL') ||
    pName.includes('AIRTEL') ||
    pName.includes('HUTCH') ||
    cName.includes('DIALOG') ||
    cName.includes('MOBITEL') ||
    cName.includes('AIRTEL') ||
    cName.includes('HUTCH')
  );
}

/**
 * Returns the assigned commission/margin percentage (e.g. 4 for 4%) for a RELOAD product.
 * Reads the assigned percentage from the product record if configured, otherwise defaults to 4%.
 */
export function getReloadCommissionPercent(product?: Product | null): number {
  if (!product) return 4;

  if (
    typeof product.reloadCommissionPercent === 'number' &&
    product.reloadCommissionPercent > 0 &&
    product.reloadCommissionPercent < 100
  ) {
    return product.reloadCommissionPercent;
  }

  if (
    typeof product.reloadCostPercent === 'number' &&
    product.reloadCostPercent > 0 &&
    product.reloadCostPercent < 100
  ) {
    return Number((100 - product.reloadCostPercent).toFixed(4));
  }

  const price = Number(product.price || 0);
  const cost = Number(product.cost || 0);

  // If unit cost was saved as a fraction of selling price (e.g. price = 1, cost = 0.96)
  if (price > 0 && cost > 0 && cost < price) {
    const derivedCommission = (1 - cost / price) * 100;
    if (derivedCommission > 0 && derivedCommission < 100) {
      return Number(derivedCommission.toFixed(4));
    }
  }

  // If cost field was entered directly as a commission % (e.g. 4 or 6 when price is 1)
  if (cost > 1 && cost <= 30) {
    return cost;
  }

  // If cost field was entered directly as a cost % (e.g. 96 or 94 when price is 1)
  if (cost >= 70 && cost < 100) {
    return Number((100 - cost).toFixed(4));
  }

  return 4;
}

/**
 * Returns the assigned unit cost percentage of selling price (e.g. 96 for 96%) for a RELOAD product.
 */
export function getReloadCostPercent(product?: Product | null): number {
  const commissionPct = getReloadCommissionPercent(product);
  return Number((100 - commissionPct).toFixed(4));
}

/**
 * Returns the decimal commission rate (e.g. 0.04 for 4%) for a RELOAD product.
 */
export function getReloadCommissionRate(product?: Product | null): number {
  return getReloadCommissionPercent(product) / 100;
}

/**
 * Returns the decimal cost rate (e.g. 0.96 for 96%) for a RELOAD product.
 */
export function getReloadCostRate(product?: Product | null): number {
  return getReloadCostPercent(product) / 100;
}
