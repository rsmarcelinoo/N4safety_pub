// Stub for @maplibre/maplibre-react-native — Expo Go only.
// MapLibre requires a dev build (npx expo run:ios).
// Shows a grey placeholder box where the map would appear.
const React = require('react');
const { View, Text, StyleSheet } = require('react-native');

const placeholder = (name) => {
  const C = ({ style, children }) =>
    React.createElement(
      View,
      { style: [{ flex: 1, backgroundColor: '#c8d3d5', alignItems: 'center', justifyContent: 'center' }, style] },
      React.createElement(Text, { style: { color: '#666', fontSize: 12 } }, `Map (${name}) — dev build required`),
      children,
    );
  C.displayName = name;
  return C;
};

const noop = () => null;

module.exports = {
  Map:           placeholder('Map'),
  MapView:       placeholder('MapView'),
  Camera:        noop,
  UserLocation:  noop,
  GeoJSONSource: ({ children }) => React.createElement(React.Fragment, null, children),
  ShapeSource:   ({ children }) => React.createElement(React.Fragment, null, children),
  FillLayer:     noop,
  LineLayer:     noop,
  SymbolLayer:   noop,
  CircleLayer:   noop,
  Layer:         noop,
  setAccessToken: () => {},
};
