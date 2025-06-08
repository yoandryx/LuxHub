export const formatPrice = (price: string) => {
    return parseFloat(price).toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
    });
};
