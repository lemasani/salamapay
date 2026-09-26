/** Synthetic, fictional demo data. No real people or businesses. */
import type { VerificationStatus } from "@/lib/risk/engine";

export const DEMO_USERS = [
  { id: "buyer-neema", name: "Neema M.", role: "buyer", verification: "verified" },
  { id: "seller-a-user", name: "Amani Electronics", role: "seller", verification: "verified" },
  { id: "seller-b-user", name: "Zuri Mobile Hub", role: "seller", verification: "partial" },
  { id: "seller-c-user", name: "Dar Phone Deals", role: "seller", verification: "unverified" },
  { id: "admin-asha", name: "Asha K. (Reviewer)", role: "admin", verification: "verified" },
] as const;

export interface SellerSeed {
  id: string;
  userId: string;
  profileLabel: string;
  expectedLevel: "low" | "medium" | "high";
  displayName: string;
  handle: string;
  phone: string;
  registeredPaymentName: string;
  accountAgeDays: number;
  completedTransactions: number;
  unresolvedDisputes: number;
  verificationStatus: VerificationStatus;
  recentDeviceChange: boolean;
  demoPaymentAccount: string;
  demoPaymentName: string;
  demoDiscount: number; // fraction below expected minimum used to prefill the demo price
  demoMessage: string;
}

export const SELLER_PROFILES: SellerSeed[] = [
  {
    id: "seller-a",
    userId: "seller-a-user",
    profileLabel: "Profile A: established seller",
    expectedLevel: "low",
    displayName: "Amani Electronics",
    handle: "@amani.electronics",
    phone: "+255 754 210 118",
    registeredPaymentName: "Amani Electronics Ltd",
    accountAgeDays: 1095,
    completedTransactions: 148,
    unresolvedDisputes: 0,
    verificationStatus: "verified",
    recentDeviceChange: false,
    demoPaymentAccount: "Lipa Namba 5528113",
    demoPaymentName: "Amani Electronics Ltd",
    demoDiscount: 0.05,
    demoMessage:
      "Hi Neema, the phone is available. You can pay through SalamaPay and I'll ship with Kilimanjaro Couriers tomorrow.",
  },
  {
    id: "seller-b",
    userId: "seller-b-user",
    profileLabel: "Profile B: newer seller",
    expectedLevel: "medium",
    displayName: "Zuri Mobile Hub",
    handle: "@zurimobile.tz",
    phone: "+255 713 884 205",
    registeredPaymentName: "Zuri Mobile Hub",
    accountAgeDays: 60,
    completedTransactions: 7,
    unresolvedDisputes: 1,
    verificationStatus: "partial",
    recentDeviceChange: false,
    demoPaymentAccount: "M-Pesa 0713 884 205",
    demoPaymentName: "Zuri Mobile Hub",
    demoDiscount: 0.3,
    demoMessage:
      "Karibu! Good price this week. Pay and we deliver within 2 days in Dar.",
  },
  {
    id: "seller-c",
    userId: "seller-c-user",
    profileLabel: "Profile C: brand-new account",
    expectedLevel: "high",
    displayName: "Dar Phone Deals",
    handle: "@darphonedeals_",
    phone: "+255 689 002 731",
    registeredPaymentName: "Dar Phone Deals",
    accountAgeDays: 5,
    completedTransactions: 1,
    unresolvedDisputes: 3,
    verificationStatus: "unverified",
    recentDeviceChange: true,
    demoPaymentAccount: "Airtel Money 0689 440 912",
    demoPaymentName: "Juma Said Mwinyi",
    demoDiscount: 0.65,
    demoMessage:
      "Only 1 left!! Send the money to my brother's number today only, no need to use the app. 100% original guaranteed. Tuma haraka.",
  },
];

export const PRODUCTS = [
  { id: "samsung-a55", name: "Samsung Galaxy A55 (128GB, new)", expectedMin: 900_000, expectedMax: 1_100_000 },
  { id: "iphone-13", name: "iPhone 13 (128GB, used)", expectedMin: 1_200_000, expectedMax: 1_500_000 },
  { id: "hp-laptop", name: "HP Laptop 15 (Core i5, 8GB)", expectedMin: 1_100_000, expectedMax: 1_400_000 },
  { id: "jbl-flip6", name: "JBL Flip 6 speaker", expectedMin: 250_000, expectedMax: 320_000 },
  { id: "kitenge", name: "Kitenge fabric bundle (6 yards)", expectedMin: 35_000, expectedMax: 60_000 },
] as const;

export const SOURCE_CHANNELS = ["Instagram", "WhatsApp", "Facebook", "TikTok", "Online marketplace", "Other"] as const;
