import '@testing-library/jest-dom/vitest'

beforeEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear()
})

