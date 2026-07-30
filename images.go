package main

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
)

type pendingImage struct {
	temporaryPath string
	finalPath     string
	storedName    string
}

func prepareImage(dir string, maxBytes int64, fileHeader *multipart.FileHeader, label string) (*pendingImage, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	source, err := fileHeader.Open()
	if err != nil {
		return nil, echoImageUnreadable(label)
	}
	defer source.Close()
	temporary, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		return nil, err
	}
	temporaryPath := temporary.Name()
	cleanup := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}
	written, copyErr := io.Copy(temporary, io.LimitReader(source, maxBytes+1))
	if closeErr := temporary.Close(); copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		cleanup()
		return nil, copyErr
	}
	if written == 0 {
		cleanup()
		return nil, echoImageEmpty(label)
	}
	if written > maxBytes {
		cleanup()
		return nil, echoImageTooLarge(label)
	}
	file, err := os.Open(temporaryPath)
	if err != nil {
		cleanup()
		return nil, err
	}
	header := make([]byte, 512)
	read, readErr := file.Read(header)
	_ = file.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		cleanup()
		return nil, readErr
	}
	extensions := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
	extension, ok := extensions[http.DetectContentType(header[:read])]
	if !ok {
		cleanup()
		return nil, echoInvalidImage(label)
	}
	token, err := newOpaqueToken()
	if err != nil {
		cleanup()
		return nil, err
	}
	storedName := token + extension
	return &pendingImage{temporaryPath: temporaryPath, finalPath: filepath.Join(dir, storedName), storedName: storedName}, nil
}

func (image *pendingImage) discard() {
	if image == nil {
		return
	}
	_ = os.Remove(image.temporaryPath)
	_ = os.Remove(image.finalPath)
}

func (image *pendingImage) commit() error {
	if image == nil {
		return nil
	}
	return os.Rename(image.temporaryPath, image.finalPath)
}
