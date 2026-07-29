# Shared frontend, изолированные контуры и межорганизационный обмен

## Архитектурное решение

Система использует один общий frontend и отдельный data plane для каждой
организации. Frontend содержит только фиксированный реестр разрешённых backend и
не имеет прямого доступа к PostgreSQL или MinIO.

```text
                         +-------------------------+
                         | Shared frontend         |
                         | текущий порт 2020       |
                         | выбор ННМЦ / Mexel      |
                         +------------+------------+
                                      |
                   +------------------+------------------+
                   |                                     |
          +--------v---------+                  +--------v---------+
          | Backend ННМЦ     |                  | Backend Mexel    |
          | текущий порт 1345|                  | отдельный сервис |
          +--------+---------+                  +--------+---------+
                   |                                     |
            DB + bucket ННМЦ                     DB + bucket Mexel
              не изменяются                         создаются новые
```

Backend не переключает базу по параметру запроса. Backend ННМЦ всегда подключён
только к БД/MinIO ННМЦ, а backend Mexel — только к ресурсам Mexel. Это основная
граница безопасности.

## Поведение frontend

- На одной странице входа пользователь выбирает ННМЦ или Mexel.
- Выбранная организация определяет API из локального allowlist.
- Перед отправкой пароля frontend вызывает `GET /api/system/organization` и
  сверяет код выбранной организации с идентичностью backend.
- Нельзя передать произвольный API URL через query string или форму.
- Активная организация хранится в `sessionStorage`, поэтому вкладки могут
  независимо работать с разными организациями.
- Последняя организация сохраняется для удобства, но ссылка с параметром
  `?organization=mexel` имеет приоритет.
- Название и цвет активной организации всегда видны на входе и в меню.
- Переключение организации не завершает вторую независимую сессию.

Сессии namespaced по организации:

```text
medsign:nnmc:token
medsign:nnmc:user
medsign:mexel:token
medsign:mexel:user
```

Старые ключи `token` и `user` однократно мигрируют в `medsign:nnmc:*`. Поэтому
обновление frontend не удаляет действующую сессию ННМЦ.

Ссылки восстановления пароля и уведомлений содержат код организации. Письмо от
Mexel откроет Mexel-контур даже если в текущей вкладке ранее использовалась ННМЦ.

## Ресурсы Coolify

Необходимы три приложения, а не пять:

1. Один текущий frontend на порту 2020.
2. Текущий backend ННМЦ на порту 1345.
3. Новый backend Mexel.

Отдельно существуют две БД PostgreSQL и два bucket MinIO. Общий frontend не
требует собственной БД или bucket.

### Shared frontend

```dotenv
# Старую переменную можно временно оставить для совместимости ННМЦ.
VITE_API_BASE=https://api-nnmc.example.kz

VITE_NNMC_API_BASE=https://api-nnmc.example.kz
VITE_NNMC_STATUS=active

VITE_MEXEL_API_BASE=https://api-mexel.example.kz
VITE_MEXEL_STATUS=active

VITE_UMIT_API_BASE=
VITE_UMIT_STATUS=planned
VITE_DEFAULT_ORGANIZATION_CODE=nnmc
```

`VITE_*` попадают в bundle во время сборки. После изменения адресов frontend
необходимо пересобрать. Адреса API публичны по своей природе и не являются
секретами; пароли и service credentials во frontend добавлять нельзя.

### Существующий backend ННМЦ

Текущие `DATABASE_*`, MinIO bucket, volume и файлы не изменяются:

```dotenv
ORGANIZATION_CODE=nnmc
ORGANIZATION_NAME="Национальный научный медицинский центр"
ORGANIZATION_SHORT_NAME="ННМЦ"
CLIENT_URL=https://sign.example.kz
CORS_ORIGINS=https://sign.example.kz
INTERORG_EXCHANGE_ENABLED=false
```

### Новый backend Mexel

```dotenv
ORGANIZATION_CODE=mexel
ORGANIZATION_NAME="ТОО Mexel Health"
ORGANIZATION_SHORT_NAME="Mexel Health"

DATABASE_CLIENT=postgres
DATABASE_URL=postgresql://medsign_mexel_user:...@postgres-mexel:5432/medsign_mexel

MINIO_ENDPOINT=https://minio.example.kz
MINIO_BUCKET=medsign-mexel
MINIO_ACCESS_KEY=отдельный-access-key
MINIO_SECRET_KEY=отдельный-secret-key

CLIENT_URL=https://sign.example.kz
CORS_ORIGINS=https://sign.example.kz
INTERORG_EXCHANGE_ENABLED=false
```

Для Mexel обязательны новые `APP_KEYS`, `API_TOKEN_SALT`,
`ADMIN_JWT_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, `TRANSFER_TOKEN_SALT`,
пароль БД и MinIO credentials. Их нельзя копировать из ННМЦ.

## Безопасный ввод в эксплуатацию

1. Зафиксировать текущий image/commit ННМЦ и проверить backup PostgreSQL и MinIO.
2. Создать staging-копию ННМЦ из backup, отключив SMTP и cron.
3. Проверить на staging старые документы всех статусов, original/current PDF,
   QR/CMS, историю и права доступа.
4. Сначала обновить backend ННМЦ, затем shared frontend. Старый `VITE_API_BASE`
   продолжает работать как fallback.
5. Создать пустую БД, отдельного DB user, новый приватный bucket и scoped MinIO
   credentials для Mexel.
6. Запустить backend Mexel и проверить
   `GET https://api-mexel.../api/system/organization`: код должен быть `mexel`.
7. Только после этого добавить `VITE_MEXEL_API_BASE` и пересобрать frontend.
8. Проверить раздельные входы, переключение, восстановление пароля, файлы,
   подпись и выход из каждой организации.

Первая версия не меняет schema `documents` и не переносит файлы ННМЦ. Rollback —
возврат к предыдущему frontend/backend image; обратная миграция документов не
нужна.

## Эксплуатационные компромиссы shared frontend

Преимущество — единый UX и одно обновление интерфейса. Ограничения нужно принять
осознанно:

- недоступность frontend затронет обе организации;
- XSS в общем origin потенциально видит namespaced сессии обеих организаций;
- frontend-релиз нельзя независимо задержать для одной компании;
- backend, БД, bucket, ключи, backup и аудит всё равно остаются независимыми.

Снизить риск помогают строгий CSP, отсутствие сторонних скриптов, dependency
scanning, фиксированный API allowlist и поэтапный rollout. Если договор потребует
физически отдельный frontend, одна кодовая база позволяет снова развернуть два
frontend без изменения backend и данных.

## Бизнес-границы

- Документ принадлежит ровно одной организации.
- Совместный сотрудник имеет отдельный аккаунт и роль в каждой базе, пока не
  внедрён корпоративный SSO.
- Совпадающие логины не означают общую учётную запись.
- Администратор ННМЦ не становится администратором Mexel.
- Frontend не объединяет списки документов разных организаций.
- Переключение организации полностью меняет API, пользователя и JWT.
- Отправка письма другой компании не открывает исходную SQL-запись получателю.

## MVP межорганизационного обмена

Межорганизационное письмо — зарегистрированная корреспонденция, а не общий доступ
к документу в чужой БД. Рекомендуемый первый сценарий: передать завершённый PDF и
вложения, получить подтверждение доставки, принятие или мотивированный отказ.

```text
draft -> queued -> sent -> delivered -> accepted
                  |          |             |
                  +-> failed +-> rejected  +-> response_sent
```

В каждом backend позднее добавляются новые add-only коллекции
`exchange_outbox`/`exchange_inbox`. Существующая запись `documents` не меняет
владельца. Отдельный Exchange Gateway маршрутизирует зашифрованные неизменяемые
пакеты и не имеет SQL-доступа к tenant-базам.

Пакет должен содержать UUID-конверта, отправителя/получателя, итоговый PDF,
вложения, CMS/сертификаты при наличии, SHA-256 manifest, время и подпись manifest.
Получение идемпотентно по UUID, поэтому повторная доставка не создаёт дубль.

До разработки заказчик утверждает:

1. Типы писем: завершённый PDF, проект или запрос на подпись.
2. Роли отправки, регистрации, принятия и отказа.
3. Правила входящего/исходящего регистрационного номера.
4. Юридический момент доставки.
5. Возможность и границу отзыва.
6. Адресацию: организация, подразделение, должность или сотрудник.
7. SLA, напоминания и эскалации.
8. Срок хранения, размер и типы вложений.
9. Правила переадресации.
10. Отчёты и доказательства доставки для аудита.
