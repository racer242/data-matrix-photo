# Data Matrix Photo Reader

JavaScript-библиотека для сканирования Data Matrix кодов из фотографий. Работает во всех современных браузерах.

## Возможности

- Распознавание Data Matrix кодов с фотографий
- Работа с изображениями любого размера, под любым углом наклона
- Полная изоляция от других скриптов и стилей (IIFE)
- Не требует серверной части — всё работает в браузере
- Использует ZXing BrowserDatamatrixCodeReader для надёжного декодирования

## Установка

1. Скопируйте файлы `data-matrix-reader.js` и `@zxing.min.js` в ваш проект

2. Подключите скрипт на вашей странице:

```html
<script src="data-matrix-reader.js"></script>
```

Библиотека ZXing будет загружена автоматически при первом вызове сканирования.

## API

### Методы

| Метод                            | Описание                                        |
| -------------------------------- | ----------------------------------------------- |
| `dataMatrixPhotoReader.upload()` | Открывает диалог выбора файла изображения       |
| `dataMatrixPhotoReader.start()`  | Запускает сканирование загруженного изображения |

### Обработчики событий

| Обработчик                                | Описание                                       | Возвращаемые данные                |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `dataMatrixPhotoReader.onUpload(fn)`      | Вызывается после успешной загрузки изображения | `{ src, width, height }`           |
| `dataMatrixPhotoReader.onReady(fn)`       | Вызывается после успешного распознавания       | `{ text, parsed, format, points }` |
| `dataMatrixPhotoReader.onUploadError(fn)` | Вызывается при ошибке загрузки                 | `{ message }`                      |
| `dataMatrixPhotoReader.onReadError(fn)`   | Вызывается при ошибке распознавания            | `{ message }`                      |

## Формат данных onReady

### rawText

Исходная строка Data Matrix кода.

### parsed

Объект с распарсенными полями кода "Честный знак":

| Поле           | Описание                                                    |
| -------------- | ----------------------------------------------------------- |
| `gtin`         | Глобальный номер товара (14 цифр, тег 01)                   |
| `serialNumber` | Серийный номер (тег 21)                                     |
| `checkCode`    | Код проверки (тег 91)                                       |
| `signature`    | Электронная подпись (тег 92)                                |
| `cryptoKey`    | Криптоключ (тег 93)                                         |
| `unknown`      | Массив нераспознанных тегов `[{ tag: "XX", value: "..." }]` |

## Пример использования

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Пример</title>
  </head>
  <body>
    <button onclick="dataMatrixPhotoReader.upload()">Загрузить</button>
    <button onclick="dataMatrixPhotoReader.start()">Считать</button>
    <div id="output"></div>

    <script src="data-matrix-reader.js"></script>
    <script>
      dataMatrixPhotoReader.onReady(function (data) {
        document.getElementById("output").textContent = data.text;
      });

      dataMatrixPhotoReader.onReadError(function (err) {
        document.getElementById("output").textContent =
          "Ошибка: " + err.message;
      });
    </script>
  </body>
</html>
```

## Интеграция

1. Скопируйте файлы `data-matrix-reader.js` и `@zxing.min.js` в ваш проект
2. Подключите `data-matrix-reader.js` в HTML-файле
3. Настройте обработчики через `onUpload`, `onReady`, `onUploadError`, `onReadError`
4. Вызывайте `upload()` для загрузки фото и `start()` для сканирования

## Зависимости

- **ZXing Library** (`@zxing.min.js`) — загружается локально из файла
- Не требует других зависимостей

## Совместимость

Работает во всех современных браузерах:

- Chrome / Edge (Chromium)
- Firefox
- Safari
- Opera

## Лицензия

MIT
