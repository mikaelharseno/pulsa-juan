import { NodeType } from 'pulsa-juan-common';
import React from 'react';

import { ErrorView } from '../components/ui';
import BillInquiryScreen from './BillInquiryScreen';
import CustomerIdScreen from './CustomerIdScreen';
import EnterAmountScreen from './EnterAmountScreen';
import ListNodeScreen from './ListNodeScreen';
import PackagesListScreen from './PackagesListScreen';
import PhoneInputScreen from './PhoneInputScreen';
import { NodeRendererProps } from './types';

export const NODE_RENDERERS: Record<NodeType, React.ComponentType<NodeRendererProps>> = {
  ListNode: ListNodeScreen,
  PackagesList: PackagesListScreen,
  PhoneNumberInput: PhoneInputScreen,
  EnterAmount: EnterAmountScreen,
  CustomerIdInput: CustomerIdScreen,
  BillInquiry: BillInquiryScreen,
};

export function UnsupportedNodeScreen() {
  return <ErrorView message="Layanan ini membutuhkan versi aplikasi terbaru. Silakan perbarui aplikasi." />;
}

export type { NodeRendererProps } from './types';
