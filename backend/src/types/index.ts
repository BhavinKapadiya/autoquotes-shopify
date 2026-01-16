export interface AQModel {
    mfrModel: string;
    stockModel?: string;
    obsoleteModels?: string[];
}

export interface AQSpecification {
    AQSpecification?: string;
    shortMarketingSpecification?: string;
    longMarketingSpecification?: string;
}

export interface AQPricing {
    netPrice: number;
    listPrice: number;
    sellPrice?: number;
}

export interface AQPicture {
    url: string;
    name?: string;
}

export interface AQProduct {
    productId: string;
    mfrId: string;
    mfrName: string;
    models: AQModel; // It is an object, not an array
    specifications: AQSpecification;
    pricing: AQPricing;
    pictures: AQPicture[];
    productCategory?: {
        name: string;
    };
    productDimension?: {
        productHeight?: number;
        productWidth?: number;
        productDepth?: number;
        shippingWeight?: number;
    };
}

export interface AQResponse<T> {
    data: T[];
}

export interface AQVariant {
    modelNumber: string;
    optionName: string;
    optionValue: string;
    priceMod: number;
    skuMod: string;
}
