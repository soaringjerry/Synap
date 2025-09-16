import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import DangerZone from './DangerZone'

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
}

const mockAdminPurgeResponses = vi.fn()

vi.mock('../../../components/Toast', () => ({
  useToast: () => mockToast,
}))

vi.mock('../ScaleEditorContext', () => ({
  useScaleEditor: () => ({
    scaleId: 'scale-123',
    state: {},
    dispatch: vi.fn(),
  }),
}))

vi.mock('../../../api/client', () => ({
  adminPurgeResponses: (scaleId: string) => mockAdminPurgeResponses(scaleId),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('DangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes purge workflow when confirmed', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('scale-123')
    render(<DangerZone />)

    const [deleteButton] = screen.getAllByRole('button', { name: 'delete_all_responses' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockAdminPurgeResponses).toHaveBeenCalledWith('scale-123')
    })
    expect(mockToast.success).toHaveBeenCalledWith('delete_success')
    promptSpy.mockRestore()
  })

  it('does not purge when confirmation mismatches', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('wrong-id')
    render(<DangerZone />)

    const [deleteButton] = screen.getAllByRole('button', { name: 'delete_all_responses' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockAdminPurgeResponses).not.toHaveBeenCalled()
    })
    expect(mockToast.success).not.toHaveBeenCalled()
    promptSpy.mockRestore()
  })
})
