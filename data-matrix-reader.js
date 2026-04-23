/**
 * Data Matrix Photo Reader
 * Библиотека для сканирования Data Matrix кодов из фотографий
 *
 * API:
 *   dataMatrixPhotoReader.upload()        - загрузить фото
 *   dataMatrixPhotoReader.start()         - начать сканирование
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
   * Запуск сканирования
   * Используем подход из официального примера: BrowserDatamatrixCodeReader.decodeFromImage()
   */
  function start() {
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

      // Создаём новый экземпляр для каждого сканирования (как в официальном примере)
      var codeReader = new ZXing.BrowserDatamatrixCodeReader();
      console.log("[DataMatrix] BrowserDatamatrixCodeReader создан");

      // Клонируем изображение (как в официальном примере)
      var img = _imageData.element.cloneNode(true);
      console.log(
        "[DataMatrix] Запуск decodeFromImage, размеры:",
        img.naturalWidth,
        "x",
        img.naturalHeight,
      );

      codeReader
        .decodeFromImage(img)
        .then(function (result) {
          console.log("[DataMatrix] Успешное декодирование!");
          console.log("[DataMatrix] Результат:", result);
          if (_callbacks.onReady) {
            _callbacks.onReady({
              text: result.text,
              format: result.formatId || "DATA_MATRIX",
              points: result.resultPoints,
            });
          }
        })
        .catch(function (err) {
          console.log("[DataMatrix] Декодирование не удалось:", err);
          if (_callbacks.onReadError) {
            _callbacks.onReadError({
              message:
                typeof err === "string"
                  ? err
                  : err.message || "Data Matrix код не найден на изображении",
            });
          }
        });

      console.log("[DataMatrix] Запущено декодирование");
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
