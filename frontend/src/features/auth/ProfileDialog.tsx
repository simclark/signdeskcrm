import {
  Button,
  Divider,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, ApiError } from '../../shared/api'
import { useAuth } from './AuthContext'

type ProfileDialogProps = {
  opened: boolean
  onClose: () => void
}

export function ProfileDialog({ opened, onClose }: ProfileDialogProps) {
  const { user, refreshMe } = useAuth()

  const profileForm = useForm({
    initialValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
    },
  })

  const passwordForm = useForm({
    initialValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
    validate: {
      new_password: (v) => (v.length < 8 ? 'At least 8 characters' : null),
      confirm_password: (v, values) =>
        v !== values.new_password ? 'Passwords do not match' : null,
    },
  })

  useEffect(() => {
    if (opened && user) {
      profileForm.setValues({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      })
      passwordForm.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user?.id])

  const saveProfile = useMutation({
    mutationFn: (values: { first_name: string; last_name: string }) =>
      api('/api/auth/profile/', { method: 'PATCH', json: values }),
    onSuccess: async () => {
      await refreshMe()
      notifications.show({ color: 'forest', message: 'Profile updated' })
    },
    onError: (err) => {
      const message = err instanceof ApiError ? String(err.message) : 'Could not update profile'
      notifications.show({ color: 'red', message })
    },
  })

  const changePassword = useMutation({
    mutationFn: (values: { current_password: string; new_password: string }) =>
      api('/api/auth/change-password/', { method: 'POST', json: values }),
    onSuccess: () => {
      passwordForm.reset()
      notifications.show({ color: 'forest', message: 'Password changed' })
    },
    onError: (err) => {
      let message = 'Could not change password'
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const data = err.data as Record<string, unknown>
        const current = data.current_password
        const next = data.new_password
        if (Array.isArray(current) && current[0]) message = String(current[0])
        else if (Array.isArray(next) && next[0]) message = String(next[0])
        else if (typeof data.detail === 'string') message = data.detail
      }
      notifications.show({ color: 'red', message })
    },
  })

  return (
    <Modal opened={opened} onClose={onClose} title="Profile" size="md">
      <Stack>
        <TextInput label="Email" value={user?.email || ''} disabled />
        <form onSubmit={profileForm.onSubmit((v) => saveProfile.mutate(v))}>
          <Stack>
            <TextInput label="First name" {...profileForm.getInputProps('first_name')} />
            <TextInput label="Last name" {...profileForm.getInputProps('last_name')} />
            <Button type="submit" loading={saveProfile.isPending}>
              Save profile
            </Button>
          </Stack>
        </form>

        <Divider my="sm" />

        <Text fw={600} size="sm">
          Change password
        </Text>
        <form
          onSubmit={passwordForm.onSubmit((v) =>
            changePassword.mutate({
              current_password: v.current_password,
              new_password: v.new_password,
            }),
          )}
        >
          <Stack>
            <PasswordInput
              label="Current password"
              {...passwordForm.getInputProps('current_password')}
            />
            <PasswordInput label="New password" {...passwordForm.getInputProps('new_password')} />
            <PasswordInput
              label="Confirm new password"
              {...passwordForm.getInputProps('confirm_password')}
            />
            <Button type="submit" variant="light" loading={changePassword.isPending}>
              Update password
            </Button>
          </Stack>
        </form>
      </Stack>
    </Modal>
  )
}
