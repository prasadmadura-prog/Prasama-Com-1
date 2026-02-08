
export const getBackendURL = (): string => {
    const hostname = window.location.hostname;

    // If running on the official Firebase Hosting URL, use the old backend
    if (hostname === 'prasama-72c8d.web.app' || hostname === 'prasama-72c8d.firebaseapp.com') {
        return 'https://prasama-pvt-ltd-erp-pos-294615686061.us-west1.run.app';
    }

    // If running on the new Cloud Run frontend or localhost, use the new backend
    // Defaults to the new URL requested by the user
    return 'https://prasama-pvt-ltd-erp-pos-147440081288.us-west1.run.app';
};

export const getFrontendURL = (): string => {
    return window.location.origin;
};
