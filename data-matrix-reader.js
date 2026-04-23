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
   * Поворот изображения на заданный угол через canvas
   * Возвращает новый Image элемент с повёрнутым изображением
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

    var rotated = new Image();
    rotated.src = canvas.toDataURL("image/png");
    return rotated;
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
   */
  function start(options) {
    var opts = options || {};
    var decodeTimeout = opts.decodeTimeout || 5000;

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

    loadZxing(function () {
      console.log("[DataMatrix] ZXing готова, начинаем декодирование");

      var angles = [0, 90, 180, 270];
      var currentAttempt = 0;
      var maxAttempts = angles.length;

      function tryDecode() {
        if (currentAttempt >= maxAttempts) {
          console.log("[DataMatrix] Все попытки исчерпаны");
          if (_callbacks.onReadError) {
            _callbacks.onReadError({
              message: "Data Matrix код не найден на изображении (4 попытки)",
            });
          }
          return;
        }

        var angle = angles[currentAttempt];
        console.log(
          "[DataMatrix] Попытка",
          currentAttempt + 1,
          "из",
          maxAttempts,
          "- поворот:",
          angle,
          "градусов",
        );

        var imgToDecode =
          angle === 0
            ? _imageData.element
            : rotateImage(_imageData.element, angle);

        console.log(
          "[DataMatrix] Запуск decodeFromImage, размеры:",
          imgToDecode.naturalWidth || imgToDecode.width,
          "x",
          imgToDecode.naturalHeight || imgToDecode.height,
        );

        var codeReader = new ZXing.BrowserDatamatrixCodeReader();

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
          .then(function (result) {
            clearTimeout(timeoutId);
            console.log("[DataMatrix] Успешное декодирование!");
            console.log("[DataMatrix] Результат:", result);
            var parsed = parseHonestMark(result.text);
            console.log("[DataMatrix] Распарсенные данные:", parsed);
            if (_callbacks.onReady) {
              _callbacks.onReady({
                text: result.text,
                parsed: parsed,
                format: result.formatId || "DATA_MATRIX",
                points: result.resultPoints,
                rotation: angle,
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
  };

  window.dataMatrixPhotoReader = dataMatrixPhotoReader;
})(window);
