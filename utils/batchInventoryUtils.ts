import { Product, ProductVariant, ProductBatch, BatchAllocation } from '../types';

/**
 * Creates a unique batch record for incoming stock.
 * Preserves the exact purchase cost, initial quantity, date, and PO reference.
 */
export const createNewBatch = (
  quantity: number,
  purchaseCost: number,
  poId?: string,
  vendorName?: string
): ProductBatch => {
  const ts = Date.now();
  const dateStr = new Date(ts).toISOString().split('T')[0];
  const rand = Math.random().toString(36).substring(2, 7);
  return {
    id: `batch-${ts}-${rand}`,
    batchNumber: poId ? `PO-${poId.slice(-6).toUpperCase()}` : `BATCH-${rand.toUpperCase()}`,
    purchaseOrderId: poId,
    timestamp: ts,
    date: dateStr,
    purchaseCost: Number(purchaseCost) || 0,
    initialQuantity: Number(quantity) || 0,
    remainingQuantity: Number(quantity) || 0,
    supplierName: vendorName || 'Direct Restock'
  };
};

/**
 * Ensures a product and all its variants have batches initialized.
 * If legacy items have stock but no batches, an initial batch is automatically generated
 * using the item's historical cost and stock quantity, guaranteeing that old stock price
 * is NEVER overwritten or lost.
 */
export const ensureProductBatches = (product: Product): Product => {
  const cloned: Product = JSON.parse(JSON.stringify(product || {}));

  if (cloned.hasSizes && cloned.variants && cloned.variants.length > 0) {
    cloned.variants = cloned.variants.map(variant => {
      let batches = variant.batches || [];
      const varStock = Number(variant.stock) || 0;
      if (batches.length === 0 && varStock > 0) {
        batches = [
          {
            id: `init-var-${variant.id || Date.now()}-${Date.now()}`,
            batchNumber: 'INITIAL-STOCK',
            timestamp: Date.now() - 86400000,
            date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            purchaseCost: Number(variant.cost ?? variant.costPrice ?? cloned.cost ?? 0),
            initialQuantity: varStock,
            remainingQuantity: varStock,
            supplierName: 'Initial Inventory'
          }
        ];
      }
      return {
        ...variant,
        cost: Number(variant.cost ?? variant.costPrice ?? cloned.cost ?? 0),
        batches
      };
    });
    // Calculate total stock across variants
    cloned.stock = cloned.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  } else {
    let batches = cloned.batches || [];
    const prodStock = Number(cloned.stock) || 0;
    if (batches.length === 0 && prodStock > 0) {
      batches = [
        {
          id: `init-prod-${cloned.id || Date.now()}-${Date.now()}`,
          batchNumber: 'INITIAL-STOCK',
          timestamp: Date.now() - 86400000,
          date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          purchaseCost: Number(cloned.cost ?? 0),
          initialQuantity: prodStock,
          remainingQuantity: prodStock,
          supplierName: 'Initial Inventory'
        }
      ];
    }
    cloned.batches = batches;
  }

  return cloned;
};

/**
 * Deducts stock using FIFO (First-In, First-Out) across available batches.
 * Preserves historical batch costs and accurately computes total cost of goods sold (COGS).
 */
export const allocateStockFIFO = (
  batches: ProductBatch[] = [],
  quantityToSell: number,
  fallbackCost: number = 0
): {
  updatedBatches: ProductBatch[];
  allocations: BatchAllocation[];
  totalCost: number;
  unitCost: number;
} => {
  if (quantityToSell <= 0) {
    return {
      updatedBatches: [...batches],
      allocations: [],
      totalCost: 0,
      unitCost: fallbackCost
    };
  }

  // Clone and sort batches chronologically (oldest first)
  const sortedBatches: ProductBatch[] = JSON.parse(JSON.stringify(batches || [])).sort(
    (a: ProductBatch, b: ProductBatch) => (a.timestamp || 0) - (b.timestamp || 0)
  );

  let remainingToFulfill = quantityToSell;
  let totalCost = 0;
  const allocations: BatchAllocation[] = [];

  for (const batch of sortedBatches) {
    if (remainingToFulfill <= 0) break;
    const avail = Number(batch.remainingQuantity) || 0;
    if (avail > 0) {
      const takeQty = Math.min(avail, remainingToFulfill);
      batch.remainingQuantity = avail - takeQty;
      remainingToFulfill -= takeQty;

      const batchCost = Number(batch.purchaseCost) || 0;
      totalCost += takeQty * batchCost;
      allocations.push({
        batchId: batch.id,
        quantity: takeQty,
        costPrice: batchCost
      });
    }
  }

  // If oversold (more than available recorded batches), cost the remainder at fallback cost
  if (remainingToFulfill > 0) {
    const remainderCost = remainingToFulfill * (Number(fallbackCost) || 0);
    totalCost += remainderCost;
    allocations.push({
      batchId: 'unbatched-stock',
      quantity: remainingToFulfill,
      costPrice: fallbackCost
    });
  }

  const unitCost = quantityToSell > 0 ? totalCost / quantityToSell : fallbackCost;

  return {
    updatedBatches: sortedBatches,
    allocations,
    totalCost,
    unitCost
  };
};

/**
 * Calculates weighted average cost across available batches.
 */
export const calculateWeightedAverageCost = (
  batches: ProductBatch[] = [],
  fallbackCost: number = 0
): number => {
  let totalQty = 0;
  let totalValue = 0;

  (batches || []).forEach(b => {
    const rem = Number(b.remainingQuantity) || 0;
    if (rem > 0) {
      totalQty += rem;
      totalValue += rem * (Number(b.purchaseCost) || 0);
    }
  });

  return totalQty > 0 ? totalValue / totalQty : fallbackCost;
};

/**
 * Searches for an item or specific size variation by barcode.
 * Priority: 1. Exact size variant barcode, 2. Main product barcode
 */
export const findItemOrVariantByBarcode = (
  products: Product[],
  barcode: string
): { product: Product; variant?: ProductVariant } | null => {
  const cleanBarcode = (barcode || '').trim().toUpperCase();
  if (!cleanBarcode) return null;

  // 1. Check size variants first
  for (const prod of (products || [])) {
    if (!prod) continue;
    if (prod.hasSizes && Array.isArray(prod.variants) && prod.variants.length > 0) {
      const matchedVariant = prod.variants.find(
        v => v && v.sku && v.sku.trim().toUpperCase() === cleanBarcode
      );
      if (matchedVariant) {
        return { product: prod, variant: matchedVariant };
      }
    }
  }

  // 2. Check main product barcode
  const matchedProd = (products || []).find(
    p => p && p.sku && p.sku.trim().toUpperCase() === cleanBarcode
  );
  if (matchedProd) {
    return { product: matchedProd };
  }

  return null;
};

/**
 * Recalculates total stock, branch stock aggregates, and display pricing
 * for a parent product based on its size variants.
 */
export const recalculateProductSummary = (product: Product): Product => {
  if (product.hasSizes && Array.isArray(product.variants) && product.variants.length > 0) {
    const totalStock = product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const validPrices = product.variants.map(v => Number(v.price) || 0).filter(p => p > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : (product.price || 0);
    const latestCost = product.variants[0]?.cost || product.cost || 0;

    // Aggregate branch stocks across variants
    const combinedBranchStocks: Record<string, number> = {};
    product.variants.forEach(v => {
      if (v.branchStocks) {
        Object.entries(v.branchStocks).forEach(([branch, qty]) => {
          combinedBranchStocks[branch] = (combinedBranchStocks[branch] || 0) + (Number(qty) || 0);
        });
      }
    });

    return {
      ...product,
      stock: totalStock,
      branchStocks: Object.keys(combinedBranchStocks).length > 0 ? combinedBranchStocks : product.branchStocks,
      price: minPrice,
      cost: latestCost
    };
  }
  return product;
};

/**
 * Applies a new stock purchase to a product or variant.
 * CRITICAL RULE: Creates a new batch with the new cost price without overwriting old stock batches.
 */
export const applyPurchaseToProduct = (
  product: Product,
  quantity: number,
  purchaseCost: number,
  stockBranch: string = 'CASHIER 1',
  poId?: string,
  vendorName?: string,
  variantId?: string,
  size?: string,
  newSellingPrice?: number
): Product => {
  let prod = ensureProductBatches(product);
  const qty = Number(quantity) || 0;
  const cost = Number(purchaseCost) || 0;

  if (prod.hasSizes && Array.isArray(prod.variants) && prod.variants.length > 0) {
    // Sized product purchase
    let variantIndex = -1;
    if (variantId) {
      variantIndex = prod.variants.findIndex(v => v.id === variantId);
    }
    if (variantIndex === -1 && size) {
      variantIndex = prod.variants.findIndex(v => (v.size || '').toUpperCase() === size.toUpperCase());
    }

    if (variantIndex !== -1) {
      const v = prod.variants[variantIndex];
      const newBatch = createNewBatch(qty, cost, poId, vendorName);
      const updatedBatches = [...(v.batches || []), newBatch];
      const updatedStock = (Number(v.stock) || 0) + qty;
      const vBranchStocks = { ...(v.branchStocks || {}) };
      vBranchStocks[stockBranch] = (Number(vBranchStocks[stockBranch]) || 0) + qty;

      prod.variants[variantIndex] = {
        ...v,
        cost: cost, // Latest purchase cost reference
        price: newSellingPrice !== undefined && newSellingPrice > 0 ? newSellingPrice : v.price,
        stock: updatedStock,
        branchStocks: vBranchStocks,
        batches: updatedBatches
      };
    } else if (size) {
      // Create new variant if not previously existing
      const newBatch = createNewBatch(qty, cost, poId, vendorName);
      const newVariant: ProductVariant = {
        id: `var-${Date.now()}-${size.toLowerCase()}`,
        size: size.toUpperCase(),
        sku: `${prod.sku}-${size.toUpperCase()}`,
        price: newSellingPrice && newSellingPrice > 0 ? newSellingPrice : prod.price,
        cost: cost,
        stock: qty,
        branchStocks: { [stockBranch]: qty },
        batches: [newBatch]
      };
      prod.variants.push(newVariant);
    }

    return recalculateProductSummary(prod);
  } else {
    // Standard product without sizes
    const newBatch = createNewBatch(qty, cost, poId, vendorName);
    const updatedBatches = [...(prod.batches || []), newBatch];
    const bStocks = { ...(prod.branchStocks || {}) };
    bStocks[stockBranch] = (Number(bStocks[stockBranch]) || 0) + qty;
    const totalStock = ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce(
      (a, key) => a + (Number(bStocks[key]) || 0),
      0
    );

    return {
      ...prod,
      cost: cost, // Latest purchase cost reference
      price: newSellingPrice !== undefined && newSellingPrice > 0 ? newSellingPrice : prod.price,
      stock: totalStock > 0 ? totalStock : (Number(prod.stock) || 0) + qty,
      branchStocks: bStocks,
      batches: updatedBatches
    };
  }
};

/**
 * Deducts sold quantity from a product or variant using FIFO on available batches.
 * Returns the updated product along with the exact cost basis and batch allocations for the sale.
 */
export const applySaleDeductionToProduct = (
  product: Product,
  quantity: number,
  stockBranch: string = 'CASHIER 1',
  variantId?: string
): {
  updatedProduct: Product;
  costBasis: number;
  allocations: BatchAllocation[];
} => {
  let prod = ensureProductBatches(product);
  const qty = Number(quantity) || 0;

  if (prod.hasSizes && Array.isArray(prod.variants) && prod.variants.length > 0) {
    const vIndex = prod.variants.findIndex(v => v.id === variantId || v.sku === variantId);
    if (vIndex !== -1) {
      const v = prod.variants[vIndex];
      const { updatedBatches, allocations, unitCost } = allocateStockFIFO(
        v.batches || [],
        qty,
        v.cost || prod.cost || 0
      );

      const vBranchStocks = { ...(v.branchStocks || {}) };
      vBranchStocks[stockBranch] = Math.max(0, (Number(vBranchStocks[stockBranch]) || 0) - qty);
      const newVarStock = Math.max(0, (Number(v.stock) || 0) - qty);

      prod.variants[vIndex] = {
        ...v,
        stock: newVarStock,
        branchStocks: vBranchStocks,
        batches: updatedBatches
      };

      const updatedProd = recalculateProductSummary(prod);
      return {
        updatedProduct: updatedProd,
        costBasis: unitCost,
        allocations
      };
    }
  }

  // Standard product without sizes or fallback
  const { updatedBatches, allocations, unitCost } = allocateStockFIFO(
    prod.batches || [],
    qty,
    prod.cost || 0
  );

  const bStocks = { ...(prod.branchStocks || {}) };
  bStocks[stockBranch] = Math.max(0, (Number(bStocks[stockBranch]) || 0) - qty);
  const totalStock = ['CASHIER 1', 'CASHIER 2', 'CASHIER 3', 'CASHIER 4'].reduce(
    (a, key) => a + (Number(bStocks[key]) || 0),
    0
  );

  const updatedProd: Product = {
    ...prod,
    stock: totalStock,
    branchStocks: bStocks,
    batches: updatedBatches
  };

  return {
    updatedProduct: updatedProd,
    costBasis: unitCost,
    allocations
  };
};
