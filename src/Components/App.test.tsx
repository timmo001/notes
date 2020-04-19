import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';

import App from './App';

test('renders placeholder', async () => {
  const { getByText } = render(<App />);
  const placeholderElement = getByText(/No username/i);
  expect(placeholderElement).toBeInTheDocument();
});
