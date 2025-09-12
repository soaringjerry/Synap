package utils

import "os"

// SafeEnv returns the environment variable value for key, or fallback if empty.
func SafeEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}
