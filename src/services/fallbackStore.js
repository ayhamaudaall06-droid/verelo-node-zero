let activeProduct = null;
export const setFallbackProduct = (p) => { activeProduct = p; };
export const getFallbackProduct = () => activeProduct;
export const clearFallbackProduct = () => { activeProduct = null; };
