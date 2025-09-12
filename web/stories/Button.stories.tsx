import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../components/ui/Button'

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = { args: { children: 'Primary', variant: 'primary' } }
export const Ghost: Story = { args: { children: 'Ghost', variant: 'ghost' } }

