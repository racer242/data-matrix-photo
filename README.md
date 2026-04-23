# Data Matrix Photo Reader

Веб-библиотека для сканирования Data Matrix кодов с фотографий на JavaScript.

## Описание

Data Matrix Photo Reader — это легковесная JavaScript-библиотека, которая позволяет распознавать Data Matrix коды на изображениях, загруженных пользователем. Библиотека полностью изолирована и не конфликтует с другими скриптами и стилями на странице.

## Возможности

- ✅ Загрузка изображений через стандартный файловый диалог
- ✅ Распознавание Data Matrix кодов на фотографиях
- ✅ Поддержка изображений любого размера и ориентации
- ✅ Работа в современных браузерах (Chrome, Firefox, Safari, Edge)
- ✅ Изолированное пространство имен
- ✅ Простой и интуитивный API
- ✅ Обработка ошибок загрузки и распознавания

## Структура проекта

```
├── src/
│   └── data-matrix-reader.js    # JS-библиотека
├── examples/
│   └── index.html               # Пример использования
└── README.md                    # Документация
```

## Быстрый старт

### 1. Подключение библиотеки

Добавьте скрипт библиотеки в ваш HTML-документ:

```html
<script src="src/data-matrix-reader.js"></script>
```

### 2. Базовое использование

```javascript
// Настраиваем обработчики событий
dataMatrixPhotoReader
    .onUpload(function(event) {
        console.log('Фото загружено:', event);
    })
    .onReady(function(result) {
        console.log('Data Matrix распознан:', result.data);
    })
    .onUploadError(function(error) {
        console.error('Ошибка загрузки:', error.message);
    })
    .onReadError(function(error) {
        console.error('Ошибка чтения:', error.message);
    });

// Загружаем фото
dataMatrixPhotoReader.upload();

// Сканируем после загрузки
dataMatrixPhotoReader.start();
```

## API

### Методы

#### `dataMatrixPhotoReader.upload()`

Открывает диалог выбора файла для загрузки изображения.

**Пример:**
```javascript
document.getElementById('uploadBtn').addEventListener('click', function() {
    dataMatrixPhotoReader.upload();
});
```

#### `dataMatrixPhotoReader.start()`

Запускает процесс сканирования загруженного изображения на наличие Data Matrix кода.

**Пример:**
```javascript
document.getElementById('scanBtn').addEventListener('click', function() {
    dataMatrixPhotoReader.start();
});
```

### Обработчики событий

#### `dataMatrixPhotoReader.onUpload(callback)`

Вызывается после успешной загрузки изображения.

**Параметры callback:**
- `event.image` — объект Image с загруженным изображением
- `event.dataUrl` — Data URL изображения

**Пример:**
```javascript
dataMatrixPhotoReader.onUpload(function(event) {
    document.getElementById('preview').src = event.dataUrl;
});
```

#### `dataMatrixPhotoReader.onReady(callback)`

Вызывается при успешном распознавании Data Matrix кода.

**Параметры callback:**
- `result.data` — распознанные данные (строка)
- `result.format` — формат кода ('DataMatrix')
- `result.position` — координаты углов кода

**Пример:**
```javascript
dataMatrixPhotoReader.onReady(function(result) {
    console.log('Код:', result.data);
    console.log('Формат:', result.format);
});
```

#### `dataMatrixPhotoReader.onUploadError(callback)`

Вызывается при ошибке загрузки изображения.

**Параметры callback:**
- `error.error` — код ошибки
- `error.message` — описание ошибки

**Пример:**
```javascript
dataMatrixPhotoReader.onUploadError(function(error) {
    alert('Ошибка загрузки: ' + error.message);
});
```

#### `dataMatrixPhotoReader.onReadError(callback)`

Вызывается при ошибке распознавания Data Matrix кода.

**Параметры callback:**
- `error.error` — код ошибки
- `error.message` — описание ошибки

**Пример:**
```javascript
dataMatrixPhotoReader.onReadError(function(error) {
    alert('Ошибка чтения: ' + error.message);
});
```

## Полная цепочка вызовов

```javascript
dataMatrixPhotoReader
    .onUpload(function(event) {
        // Фото загружено, можно показать превью
        console.log('Загружено:', event.dataUrl);
    })
    .onReady(function(result) {
        // Код успешно распознан
        console.log('Результат:', result.data);
    })
    .onUploadError(function(error) {
        // Ошибка при загрузке файла
        console.error('Ошибка загрузки:', error);
    })
    .onReadError(function(error) {
        // Код не найден или ошибка распознавания
        console.error('Ошибка чтения:', error);
    });

// Запуск процесса
dataMatrixPhotoReader.upload();
// После загрузки (в onUpload) вызываем:
dataMatrixPhotoReader.start();
```

## Интеграция в проект

### Вариант 1: Прямое подключение

```html
<!DOCTYPE html>
<html>
<head>
    <title>Мое приложение</title>
</head>
<body>
    <button onclick="dataMatrixPhotoReader.upload()">Загрузить</button>
    <button onclick="dataMatrixPhotoReader.start()">Сканировать</button>
    
    <script src="path/to/data-matrix-reader.js"></script>
    <script>
        dataMatrixPhotoReader
            .onReady(function(result) {
                console.log('Data Matrix:', result.data);
            })
            .onReadError(function(error) {
                console.log('Ошибка:', error.message);
            });
    </script>
</body>
</html>
```

### Вариант 2: Использование с модулями

Библиотека также поддерживает CommonJS:

```javascript
const dataMatrixPhotoReader = require('./data-matrix-reader');
```

## Требования к браузеру

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+
- Opera 47+

Библиотека использует следующие современные API:
- FileReader
- Canvas API
- ES5 JavaScript

## Советы по использованию

1. **Качество изображения**: Для лучшего распознавания используйте изображения с хорошим освещением и четким контрастом.

2. **Размер кода**: Data Matrix код должен занимать достаточную часть изображения для надежного распознавания.

3. **Обработка ошибок**: Всегда подключайте обработчики `onUploadError` и `onReadError` для информирования пользователя об ошибках.

4. **UX**: Показывайте индикатор загрузки во время сканирования, так как процесс может занять некоторое время.

## Пример полного приложения

Смотрите файл `examples/index.html` для полного рабочего примера с интерфейсом.

## Лицензия

MIT License

## Поддержка

Для вопросов и предложений создайте issue в репозитории проекта.
