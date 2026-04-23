/**
 * Data Matrix Photo Reader
 * Библиотека для сканирования Data Matrix кодов из фотографий
 *
 * API:
 *   dataMatrixPhotoReader.upload()        - загрузить фото
 *   dataMatrixPhotoReader.start(options)  - начать сканирование
 *     options.decodeTimeout - таймаут на одну попытку (мс), по умолчанию 5000
 *   dataMatrixPhotoReader.onUpload(fn)    - обработчик загрузки
 *   dataMatrixPhotoReader.onReady(fn)     - обработчик результата
 *   dataMatrixPhotoReader.onUploadError(fn) - обработчик ошибки загрузки
 *   dataMatrixPhotoReader.onReadError(fn)   - обработчик ошибки чтения
 */
(function (window) {
  "use strict";

  var ZXING_CDN = "@zxing.min.js";

  var _imageData = null;
  var _zxingLoaded = false;
  var _zxingLoading = false;
  var _callbacks = {
    onUpload: null,
    onReady: null,
    onUploadError: null,
    onReadError: null,
    onAttempt: null,
  };

  /**
   * Парсер кодов "Честный знак" (GS1 DataMatrix)
   * Извлекает все теги из строки формата: 01<GTIN>21<Serial>91<Check>...
   *
   * GS1 коды могут содержать символ-разделитель \x1D (GS, Group Separator),
   * который отображается как "" или другие непечатаемые символы.
   * Этот символ используется как разделитель полей (FNC1).
   */
  function parseHonestMark(rawText) {
    var result = {
      gtin: "",
      serialNumber: "",
      checkCode: "",
      signature: "",
      cryptoKey: "",
      unknown: [],
    };

    if (!rawText) return result;

    // Удаляем все непечатаемые/управляющие символы (GS \x1D, FNC1, и т.д.)
    var text = rawText.replace(/[\x00-\x1F\x7F]/g, "");

    console.log("[DataMatrix] parseHonestMark: очищенный текст =", text);

    // Паттерны для известных тегов GS1
    var knownTags = {};
    knownTags["01"] = { field: "gtin", fixedLength: 14 };
    knownTags["21"] = { field: "serialNumber", fixedLength: null };
    knownTags["91"] = { field: "checkCode", fixedLength: null };
    knownTags["92"] = { field: "signature", fixedLength: null };
    knownTags["93"] = { field: "cryptoKey", fixedLength: null };

    var pos = 0;
    var textLen = text.length;

    while (pos < textLen - 1) {
      // Ищем следующий тег (2 цифры)
      var tagMatch = text.substring(pos, pos + 2);

      // Проверяем, что это известный тег
      if (knownTags[tagMatch]) {
        var tagInfo = knownTags[tagMatch];
        pos += 2; // пропускаем тег

        if (tagInfo.fixedLength) {
          // Фиксированная длина (GTIN всегда 14 цифр)
          result[tagInfo.field] = text.substring(
            pos,
            pos + tagInfo.fixedLength,
          );
          pos += tagInfo.fixedLength;
        } else {
          // Переменная длина - читаем до следующего тега или конца
          var valueStart = pos;
          var valueEnd = textLen;

          // Ищем следующий известный тег
          for (var searchPos = pos + 2; searchPos < textLen - 1; searchPos++) {
            var nextTag = text.substring(searchPos, searchPos + 2);
            if (knownTags[nextTag]) {
              valueEnd = searchPos;
              break;
            }
          }

          result[tagInfo.field] = text.substring(valueStart, valueEnd);
          pos = valueEnd;
        }
      } else {
        // Пропускаем нераспознанные символы
        pos++;
      }
    }

    return result;
  }

  /**
   * Приближение (кроп) центральной части изображения
   * percentage - сколько оставить от оригинала (0.25 = 25%, 0.5 = 50%)
   */
  function zoomImage(img, percentage) {
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");

    // Вычисляем размеры центральной части
    var cropWidth = img.naturalWidth * percentage;
    var cropHeight = img.naturalHeight * percentage;
    var cropX = (img.naturalWidth - cropWidth) / 2;
    var cropY = (img.naturalHeight - cropHeight) / 2;

    // Рисуем центральную часть, растягивая на весь canvas
    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropWidth,
      cropHeight, // source
      0,
      0,
      img.naturalWidth,
      img.naturalHeight, // destination
    );

    var dataUrl = canvas.toDataURL("image/png");
    var result = new Image();
    result.src = dataUrl;
    return { image: result, dataUrl: dataUrl };
  }

  /**
   * Увеличение контраста изображения
   * factor > 1 для увеличения контраста
   */
  function increaseContrast(img, factor) {
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
      data[i] = clamp((data[i] - 128) * factor + 128); // R
      data[i + 1] = clamp((data[i + 1] - 128) * factor + 128); // G
      data[i + 2] = clamp((data[i + 2] - 128) * factor + 128); // B
    }

    ctx.putImageData(imageData, 0, 0);
    var dataUrl = canvas.toDataURL("image/png");
    var result = new Image();
    result.src = dataUrl;
    return { image: result, dataUrl: dataUrl };
  }

  /**
   * Преобразование изображения в черно-белый (бинаризация)
   */
  function toBlackWhite(img) {
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
      // Grayscale
      var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      // Binary threshold
      var val = gray > 128 ? 255 : 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
    var dataUrl = canvas.toDataURL("image/png");
    var result = new Image();
    result.src = dataUrl;
    return { image: result, dataUrl: dataUrl };
  }

  /**
   * Ограничение значения в диапазоне 0-255
   */
  function clamp(value) {
    return Math.max(0, Math.min(255, value));
  }

  /**
   * Масштабирование изображения по наибольшей стороне
   * Если изображение больше maxSize, оно уменьшается
   */
  function scaleImage(img, maxSize) {
    var width = img.naturalWidth;
    var height = img.naturalHeight;

    if (width <= maxSize && height <= maxSize) {
      // Изображение уже в пределах допустимого размера
      return { image: img, dataUrl: _imageData.src, scaled: false };
    }

    var scale = maxSize / Math.max(width, height);
    var newWidth = Math.round(width * scale);
    var newHeight = Math.round(height * scale);

    console.log(
      "[DataMatrix] scaleImage: масштабирование с",
      width,
      "x",
      height,
      "до",
      newWidth,
      "x",
      newHeight,
    );

    var canvas = document.createElement("canvas");
    canvas.width = newWidth;
    canvas.height = newHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    var dataUrl = canvas.toDataURL("image/png");
    var result = new Image();
    result.src = dataUrl;
    return { image: result, dataUrl: dataUrl, scaled: true };
  }

  /**
   * Поворот изображения на заданный угол через canvas
   * Возвращает объект { image: Image, dataUrl: string } с повёрнутым изображением
   */
  function rotateImage(img, angle) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    var radians = (angle * Math.PI) / 180;

    // Для 90 и 270 градусов меняем ширину и высоту
    if (angle === 90 || angle === 270) {
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
    } else {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(
      img,
      -img.naturalWidth / 2,
      -img.naturalHeight / 2,
      img.naturalWidth,
      img.naturalHeight,
    );

    var dataUrl = canvas.toDataURL("image/png");
    var rotated = new Image();
    rotated.src = dataUrl;
    return { image: rotated, dataUrl: dataUrl };
  }

  /**
   * Динамическая загрузка ZXing библиотеки
   */
  function loadZxing(callback) {
    console.log("[DataMatrix] loadZxing: проверка состояния");
    if (_zxingLoaded) {
      console.log("[DataMatrix] ZXing уже загружена");
      callback();
      return;
    }
    if (_zxingLoading) {
      console.log("[DataMatrix] ZXing загружается, ожидаем...");
      var checkInterval = setInterval(function () {
        if (_zxingLoaded) {
          clearInterval(checkInterval);
          callback();
        }
      }, 100);
      return;
    }
    _zxingLoading = true;
    console.log("[DataMatrix] Загрузка ZXing:", ZXING_CDN);

    var script = document.createElement("script");
    script.src = ZXING_CDN;
    script.onload = function () {
      console.log("[DataMatrix] ZXing успешно загружена");
      _zxingLoaded = true;
      _zxingLoading = false;
      callback();
    };
    script.onerror = function () {
      console.error("[DataMatrix] Ошибка загрузки ZXing");
      _zxingLoading = false;
      if (_callbacks.onReadError) {
        _callbacks.onReadError({
          message: "Ошибка загрузки библиотеки декодирования",
        });
      }
    };
    document.head.appendChild(script);
  }

  /**
   * Загрузка фото через input[type=file]
   */
  function upload() {
    console.log("[DataMatrix] upload: открытие диалога выбора файла");
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    input.onchange = function (e) {
      console.log("[DataMatrix] Файл выбран");
      var file = e.target.files[0];
      if (!file) {
        console.log("[DataMatrix] Файл не выбран");
        if (_callbacks.onUploadError) {
          _callbacks.onUploadError({ message: "Файл не выбран" });
        }
        return;
      }
      console.log(
        "[DataMatrix] Имя файла:",
        file.name,
        "Размер:",
        file.size,
        "Тип:",
        file.type,
      );

      if (!file.type.match(/^image\//)) {
        console.error("[DataMatrix] Неверный тип файла:", file.type);
        if (_callbacks.onUploadError) {
          _callbacks.onUploadError({
            message: "Выбранный файл не является изображением",
          });
        }
        return;
      }

      var reader = new FileReader();
      console.log("[DataMatrix] Чтение файла через FileReader");
      reader.onload = function (event) {
        console.log(
          "[DataMatrix] Файл прочитан, размер base64:",
          event.target.result.length,
        );
        var src = event.target.result;
        var img = new Image();
        img.onload = function () {
          console.log(
            "[DataMatrix] Изображение загружено, размеры:",
            img.naturalWidth,
            "x",
            img.naturalHeight,
          );
          _imageData = { src: src, element: img };
          if (_callbacks.onUpload) {
            console.log("[DataMatrix] Вызов обработчика onUpload");
            _callbacks.onUpload({
              src: src,
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
          }
        };
        img.onerror = function () {
          console.error("[DataMatrix] Ошибка загрузки изображения");
          if (_callbacks.onUploadError) {
            _callbacks.onUploadError({ message: "Ошибка чтения изображения" });
          }
        };
        img.src = src;
      };
      reader.onerror = function () {
        console.error("[DataMatrix] Ошибка FileReader");
        if (_callbacks.onUploadError) {
          _callbacks.onUploadError({ message: "Ошибка чтения файла" });
        }
      };
      reader.readAsDataURL(file);
    };

    document.body.appendChild(input);
    input.click();
    setTimeout(function () {
      document.body.removeChild(input);
    }, 1000);
  }

  /**
   * Запуск сканирования с поддержкой поворота и таймаута
   * @param {Object} options - опции сканирования
   * @param {number} options.decodeTimeout - таймаут на одну попытку в мс (по умолчанию 5000)
   * @param {number} options.maxSize - максимальный размер изображения по наибольшей стороне (по умолчанию не задан)
   */
  function start(options) {
    var opts = options || {};
    var decodeTimeout = opts.decodeTimeout || 5000;
    var maxSize = opts.maxSize || null;

    console.log("[DataMatrix] start: запуск сканирования");
    if (!_imageData) {
      console.error("[DataMatrix] Изображение не загружено");
      if (_callbacks.onReadError) {
        _callbacks.onReadError({
          message: "Изображение не загружено. Сначала вызовите upload()",
        });
      }
      return;
    }
    console.log("[DataMatrix] Изображение загружено, запуск ZXing...");

    // Масштабирование изображения если задан maxSize
    var sourceImage = _imageData.element;
    if (maxSize) {
      console.log(
        "[DataMatrix] Масштабирование изображения, maxSize:",
        maxSize,
      );
      var scaledResult = scaleImage(sourceImage, maxSize);
      if (scaledResult.scaled) {
        sourceImage = scaledResult.image;
        console.log("[DataMatrix] Изображение масштабировано");
      } else {
        console.log("[DataMatrix] Изображение не требует масштабирования");
      }
    }

    loadZxing(function () {
      console.log("[DataMatrix] ZXing готова, начинаем декодирование");

      // Стратегия попыток:
      // 1. Приближение 25% (кроп центральной части)
      // 2. Приближение 50% (кроп центральной части)
      // 3. Увеличение контраста
      // 4. Черно-белое изображение
      // 5. Оригинальное + поворот 0°
      // 6. Поворот 90°
      // 7. Поворот 180°
      // 8. Поворот 270°
      var currentAttempt = 0;
      var maxAttempts = 8;

      var attemptLabels = [
        { type: "rotate", angle: 0, name: "Оригинал (0°)" },
        { type: "zoom", percentage: 0.75, name: "Приближение 25%" },
        { type: "zoom", percentage: 0.5, name: "Приближение 50%" },
        { type: "contrast", name: "Увеличение контраста" },
        { type: "bw", name: "Черно-белое" },
        { type: "rotate", angle: 90, name: "Поворот 90°" },
        { type: "rotate", angle: 180, name: "Поворот 180°" },
        { type: "rotate", angle: 270, name: "Поворот 270°" },
      ];

      function tryDecode() {
        if (currentAttempt >= maxAttempts) {
          console.log("[DataMatrix] Все попытки исчерпаны");
          if (_callbacks.onReadError) {
            _callbacks.onReadError({
              message: "Data Matrix код не найден на изображении (8 попыток)",
            });
          }
          return;
        }

        var attemptInfo = attemptLabels[currentAttempt];
        var result;

        console.log(
          "[DataMatrix] Попытка",
          currentAttempt + 1,
          "из",
          maxAttempts,
          "-",
          attemptInfo.name,
        );

        // Подготавливаем изображение в зависимости от типа попытки
        // Используем sourceImage (который может быть масштабирован)
        if (attemptInfo.type === "zoom") {
          result = zoomImage(sourceImage, attemptInfo.percentage);
        } else if (attemptInfo.type === "contrast") {
          result = increaseContrast(sourceImage, 2.0);
        } else if (attemptInfo.type === "bw") {
          result = toBlackWhite(sourceImage);
        } else {
          var angle = attemptInfo.angle;
          if (angle === 0) {
            result = {
              image: sourceImage,
              dataUrl: sourceImage.src || _imageData.src,
            };
          } else {
            result = rotateImage(sourceImage, angle);
          }
        }

        var imgToDecode = result.image;

        console.log(
          "[DataMatrix] Запуск decodeFromImage, размеры:",
          imgToDecode.naturalWidth || imgToDecode.width,
          "x",
          imgToDecode.naturalHeight || imgToDecode.height,
        );

        // Уведомляем о попытке
        if (_callbacks.onAttempt) {
          var angleValue =
            attemptInfo.type === "rotate" ? attemptInfo.angle : null;
          _callbacks.onAttempt({
            attempt: currentAttempt + 1,
            maxAttempts: maxAttempts,
            angle: angleValue,
            type: attemptInfo.type,
            label: attemptInfo.name,
            dataUrl: result.dataUrl,
          });
        }

        // Создаём hints для усиленного поиска
        var hints = new Map();
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.DATA_MATRIX,
        ]);

        console.log(
          "[DataMatrix] Создание ридера с TRY_HARDER и POSSIBLE_FORMATS",
        );

        var codeReader = new ZXing.BrowserDatamatrixCodeReader(hints);

        var timeoutId = setTimeout(function () {
          console.log(
            "[DataMatrix] Таймаут попытки",
            currentAttempt + 1,
            "(",
            decodeTimeout,
            "мс)",
          );
          currentAttempt++;
          tryDecode();
        }, decodeTimeout);

        codeReader
          .decodeFromImage(imgToDecode)
          .then(function (decodeResult) {
            clearTimeout(timeoutId);
            console.log("[DataMatrix] Успешное декодирование!");
            console.log("[DataMatrix] Результат:", decodeResult);
            var parsed = parseHonestMark(decodeResult.text);
            console.log("[DataMatrix] Распарсенные данные:", parsed);
            if (_callbacks.onReady) {
              _callbacks.onReady({
                text: decodeResult.text,
                parsed: parsed,
                format: decodeResult.formatId || "DATA_MATRIX",
                points: decodeResult.resultPoints,
                attemptType: attemptInfo.type,
                attemptLabel: attemptInfo.name,
              });
            }
          })
          .catch(function (err) {
            clearTimeout(timeoutId);
            console.log(
              "[DataMatrix] Попытка",
              currentAttempt + 1,
              "не удалась:",
              err,
            );
            currentAttempt++;
            tryDecode();
          });
      }

      tryDecode();
    });
  }

  // Public API
  var dataMatrixPhotoReader = {
    upload: upload,
    start: start,
    onUpload: function (fn) {
      _callbacks.onUpload = fn;
    },
    onReady: function (fn) {
      _callbacks.onReady = fn;
    },
    onUploadError: function (fn) {
      _callbacks.onUploadError = fn;
    },
    onReadError: function (fn) {
      _callbacks.onReadError = fn;
    },
    onAttempt: function (fn) {
      _callbacks.onAttempt = fn;
    },
  };

  window.dataMatrixPhotoReader = dataMatrixPhotoReader;
})(window);
