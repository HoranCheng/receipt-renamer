export const CATEGORIES = [
  "Grocery","Dining","Fuel","Medical","Hardware & Garden",
  "Outdoor & Camping","Transport","Utilities","Entertainment",
  "Shopping","Education","Insurance","Subscription","Other"
];

export const CAT_ICON = {
  Grocery:"\u{1F6D2}",Dining:"\u{1F37D}\uFE0F",Fuel:"\u26FD",Medical:"\u{1F48A}","Hardware & Garden":"\u{1F527}",
  "Outdoor & Camping":"\u{1F3D5}\uFE0F",Transport:"\u{1F68C}",Utilities:"\u{1F4A1}",Entertainment:"\u{1F3AC}",
  Shopping:"\u{1F6CD}\uFE0F",Education:"\u{1F4DA}",Insurance:"\u{1F6E1}\uFE0F",Subscription:"\u{1F4F1}",Other:"\u{1F4C4}"
};

export const CAT_CLR = {
  Grocery:"#34d399",Dining:"#fbbf24",Fuel:"#f87171",Medical:"#f472b6",
  "Hardware & Garden":"#a78bfa","Outdoor & Camping":"#2dd4bf",Transport:"#60a5fa",
  Utilities:"#818cf8",Entertainment:"#fb923c",Shopping:"#fb7185",
  Education:"#38bdf8",Insurance:"#94a3b8",Subscription:"#a78bfa",Other:"#64748b"
};

export const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets";

export const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
  "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest",
];

export const DRIVE_FOLDERS = {
  inbox: "00_inbox",
  validated: "10_validated",
  review: "20_flags/review_needed",
};

export const DEFAULT_CONFIG = {
  clientId: "",
  connected: false,
  inboxFolder: "00_inbox",
  validatedFolder: "10_validated",
  reviewFolder: "20_review_needed",
  sheetId: "",
  sheetName: "receipt_index",
  setupDone: false,
};
