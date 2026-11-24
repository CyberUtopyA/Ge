/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it, jest} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

jest.mock('react-native-gesture-handler', () => {
  const {View} = require('react-native');
  return {GestureHandlerRootView: View};
});
jest.mock('../src/utopy/ui/PortalHost', () => ({__esModule: true, default: () => null}));
jest.mock('../src/goodenergy/ui/GoodEnergy.surface', () => ({GoodEnergySurface: () => null}));
jest.mock('../src/modeler/Surface', () => ({ModelerSurface: () => null}));
jest.mock('../src/goodenergy', () => ({prepareGoodEnergy: () => ({}), startGoodEnergy: async () => {}}));
jest.mock('../src/modeler', () => ({bootModeler: async () => {}}));
jest.mock('../src/sensors/telemetrybridge', () => ({startTelemetryBridge: () => {}}));
jest.mock('../src/goodenergy/energy.core', () => ({bootstrapEnergyCoreController: () => {}}));
jest.mock('../src/utopy/spore', () => ({initSpores: async () => {}, spore: {sayIntent: async () => {}}}));

it('renders correctly', () => {
  renderer.create(<App />);
});
