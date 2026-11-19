// @vitest-environment jsdom
import { Amplify } from 'aws-amplify';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import SignInScreen from './SignInScreen';

beforeEach(() => {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: 'us-east-1_example',
        userPoolClientId: 'example',
        loginWith: { email: true },
      },
    },
  });
});
afterEach(cleanup);

it('asks for an email and a password, under the app name', async () => {
  render(<SignInScreen />);
  expect(await screen.findByRole('heading', { name: "Susan's Calendar" })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
});

it('offers no way to create an account', async () => {
  render(<SignInScreen />);
  await screen.findByRole('button', { name: /^sign in$/i });
  expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});
