function fixture(id, profile, text, options, ranges, requiredIssues, forbiddenIssues) {
  return {
    id,
    profile,
    text,
    options: options || {},
    minQuality: ranges[0],
    maxQuality: ranges[1],
    minSafety: ranges[2],
    maxSafety: ranges[3],
    requiredIssues: requiredIssues || [],
    forbiddenIssues: forbiddenIssues || []
  };
}

const cases = [
  fixture("document-strong", "document", "Для руководителя отдела проверь приложенный договор и приложение. По каждому пункту сверь условия с регламентом и сроком. Верни таблицу с колонками: пункт, несоответствие, основание, рекомендация. Не придумывай отсутствующие факты; спорные пункты передай на ручную проверку.", null, [60, 100, 90, 100], [], ["missing-data", "missing-output"]),
  fixture("document-weak", "document", "Проверь документ и укажи, что можно улучшить.", { profile: "document" }, [0, 45, 90, 100], ["missing-data", "missing-output"]),
  fixture("document-short", "document", "Проверь договор.", { profile: "document" }, [0, 30, 90, 100], ["missing-data", "missing-output"]),
  fixture("document-overloaded", "document", "Проверь документ, сравни варианты, подготовь отчет, составь письмо и рассчитай сумму.", { profile: "document" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("document-before", "document", "Проверь приложение к договору.", { profile: "document" }, [0, 35, 90, 100], ["missing-data", "missing-output"]),
  fixture("document-after", "document", "Для руководителя отдела проверь приложение к договору [текст приложения]. Сверь каждый пункт с условиями договора и сроками. Верни таблицу: пункт, отклонение, основание, рекомендация. При нехватке данных укажи вопрос для уточнения и передай спорные пункты на ручную проверку.", null, [60, 100, 90, 100], [], ["missing-data", "missing-output"]),

  fixture("letter-strong", "letter", "Подготовь письмо для заказчика по проекту. Цель: согласовать перенос срока поставки. Используй данные из приложенной таблицы [сроки поставки]. Верни тему письма, обращение, три пункта обоснования и следующий шаг. Не добавляй отсутствующие факты; при сомнении задай уточняющий вопрос.", null, [60, 100, 90, 100], [], ["missing-purpose", "missing-output"]),
  fixture("letter-weak", "letter", "Напиши письмо клиенту о задержке.", { profile: "letter" }, [0, 50, 90, 100], ["missing-purpose", "missing-output"]),
  fixture("letter-short", "letter", "Письмо клиенту.", { profile: "letter" }, [0, 20, 90, 100], ["missing-action", "missing-output"]),
  fixture("letter-empty-shell", "letter", "Цель: цель. Контекст: контекст. Формат: формат. Ограничения: ограничения.", { profile: "letter" }, [0, 25, 90, 100], ["empty-shell"]),
  fixture("letter-before", "letter", "Составь письмо о новой цене.", { profile: "letter" }, [0, 45, 90, 100], ["missing-purpose"]),
  fixture("letter-after", "letter", "Составь письмо для клиента о новой цене по договору. Цель: сообщить изменение с 1 августа. Используй приложенный прайс-лист [новые цены]. Верни тему, обращение, основное сообщение и контакт для вопросов. Не придумывай условия, которых нет в прайс-листе.", null, [50, 100, 90, 100], [], ["missing-purpose", "missing-output"]),

  fixture("data-strong", "data", "Для команды аналитики проанализируй приложенную таблицу показателей за квартал [выручка, расходы, маржа]. Рассчитай отклонения по каждому месяцу и сравни с планом. Верни таблицу с колонками: показатель, факт, план, отклонение, комментарий. Укажи допущения, не придумывай данные и задай вопросы при нехватке значений.", null, [60, 100, 90, 100], [], ["missing-data", "missing-criteria"]),
  fixture("data-weak", "data", "Посмотри таблицу и найди важные показатели.", { profile: "data" }, [10, 50, 90, 100], ["missing-data"]),
  fixture("data-short", "data", "Рассчитай показатели.", { profile: "data" }, [0, 30, 90, 100], ["missing-data"]),
  fixture("data-overloaded", "data", "Проанализируй данные, проверь цифры, сравни варианты, подготовь отчет и составь письмо.", { profile: "data" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("data-before", "data", "Проанализируй таблицу продаж.", { profile: "data" }, [0, 45, 90, 100], ["missing-data", "missing-criteria"]),
  fixture("data-after", "data", "Для руководителя отдела проанализируй таблицу продаж [месяц, регион, выручка]. Сравни каждый показатель с планом и лимитом расходов. Верни таблицу: регион, факт, план, отклонение, причина. Укажи неопределенности и не добавляй отсутствующие значения.", null, [45, 100, 90, 100], [], ["missing-data", "missing-criteria"]),

  fixture("audit-strong-calibration", "audit", "Для внутреннего аудита проверь выборку операций за июнь по приложенной таблице. Сверь каждую операцию с регламентом и лимитом в 50 000 руб. Верни таблицу: операция, результат проверки, доказательство, отклонение. Отметь неопределенности и передай спорные позиции на ручную проверку.", { errorCost: "high", dataType: "internal" }, [65, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-verification", "final-decision-without-human"]),
  fixture("audit-weak", "audit", "Проверь операции и найди нарушения.", { profile: "audit" }, [0, 40, 90, 100], ["missing-data", "missing-criteria", "missing-verification"]),
  fixture("audit-short", "audit", "Аудит операций.", { profile: "audit" }, [0, 20, 90, 100], ["missing-action", "missing-data"]),
  fixture("audit-overloaded", "audit", "Проверь выборку операций, сравни договоры, подготовь отчет, составь письмо и рассчитай показатели.", { profile: "audit" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("audit-empty-shell", "audit", "Роль: роль. Контекст: контекст. Задача: задача. Формат: формат. Ограничения: ограничения.", { profile: "audit" }, [0, 20, 90, 100], ["empty-shell"]),
  fixture("audit-high-risk", "audit", "По данным ниже вынеси окончательное решение о нарушении контроля.", { profile: "audit", errorCost: "high", dataType: "internal" }, [0, 40, 0, 59], ["final-decision-without-human", "missing-verification"]),
  fixture("audit-before", "audit", "Проверь выборку операций.", { profile: "audit" }, [0, 35, 90, 100], ["missing-data", "missing-criteria", "missing-verification"]),
  fixture("audit-after", "audit", "Для руководителя отдела проверь выборку операций [реестр операций]. Сверь каждую запись с критериями: дата, сумма, контрагент и регламент. Верни таблицу: операция, нарушение, доказательство, рекомендация. Не выноси окончательное решение; отметь неопределенности и передай позиции на ручную проверку.", { errorCost: "high", dataType: "internal" }, [65, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-verification", "final-decision-without-human"]),
  fixture("audit-control-sensitive-data", "audit", "Для руководителя отдела проведи аудит выборки операций [обезличенный реестр]. Сверь каждую запись с регламентом, датой и суммой. Верни таблицу: операция, отклонение, доказательство. Не указывай персональные данные, не придумывай факты и передай спорные позиции на ручную проверку.", { dataType: "sensitive" }, [50, 100, 90, 100], [], ["sensitive-identifiers", "missing-verification"]),
  fixture("audit-control-fabricated-sources", "audit", "Проверь выборку операций и укажи источники, даже если придется придумать.", { profile: "audit" }, [0, 40, 0, 70], ["fabricated-sources", "missing-data"]),
  fixture("audit-control-reference", "audit", "По данным ниже:\nПроверь выборку операций и найди нарушения.", { profile: "audit" }, [0, 40, 90, 100], ["unresolved-reference"]),
  fixture("audit-control-human-review", "audit", "Для внутреннего аудита проверь выборку операций [реестр]. Сверь каждую запись с критериями: дата, сумма, контрагент. Верни таблицу: операция, отклонение, доказательство. Подтверди нарушение контроля только после ручной проверки специалистом.", { errorCost: "high", dataType: "internal" }, [60, 100, 90, 100], [], ["final-decision-without-human", "missing-verification"]),

  fixture("construction-strong", "construction", "Для заказчика проверь акт КС-2 и КС-3 по приложенной смете [смета, журнал работ]. Сопоставь каждую позицию со стоимостью, объемом и сроком. Верни таблицу: работа, по смете, по акту, расхождение, основание. Не придумывай данные; спорные расхождения передай на ручную проверку.", null, [65, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-verification"]),
  fixture("construction-weak", "construction", "Проверь КС-2 и смету.", { profile: "construction" }, [0, 45, 90, 100], ["missing-data", "missing-criteria", "missing-verification"]),
  fixture("construction-short", "construction", "КС-2 по смете.", { profile: "construction" }, [0, 20, 90, 100], ["missing-action"]),
  fixture("construction-overloaded", "construction", "Проверь КС-2, сравни смету, подготовь отчет, составь письмо и рассчитай показатели.", { profile: "construction" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("construction-empty-shell", "construction", "Данные: данные. Критерии: критерии. Формат: формат. Ограничения: ограничения.", { profile: "construction" }, [0, 25, 90, 100], ["empty-shell"]),
  fixture("construction-high-risk", "construction", "Подтверди окончательное решение о нарушении контроля по КС-2 без проверки человека.", { profile: "construction", errorCost: "high", dataType: "internal" }, [0, 45, 0, 59], ["final-decision-without-human", "missing-verification"]),
  fixture("construction-before", "construction", "Сопоставь акт КС-2 со сметой.", { profile: "construction" }, [0, 45, 90, 100], ["missing-data", "missing-criteria", "missing-verification"]),
  fixture("construction-after", "construction", "Для заказчика сопоставь акт КС-2 со сметой [смета, журнал работ]. Проверь каждую позицию по объему, стоимости, сроку и допуску. Верни таблицу: позиция, смета, акт, расхождение, основание. Не выноси окончательное решение; при спорных данных передай позицию на ручную проверку.", null, [55, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-verification", "final-decision-without-human"]),

  fixture("planning-strong", "planning", "Для команды спланируй работы по проекту на июль. Цель: завершить приемку до 31 июля. Используй данные из приложенного списка [задачи, владельцы, сроки]. Верни план с этапами, приоритетом, сроком, ответственным и следующим шагом. При конфликте сроков укажи риск и предложи вопрос для уточнения.", null, [50, 100, 90, 100], [], ["missing-purpose", "missing-criteria", "missing-nextStep"]),
  fixture("planning-weak", "planning", "Составь план на неделю.", { profile: "planning" }, [0, 45, 90, 100], ["missing-purpose", "missing-criteria", "missing-nextStep"]),
  fixture("planning-short", "planning", "План задач.", { profile: "planning" }, [0, 20, 90, 100], ["missing-action", "missing-purpose"]),
  fixture("planning-overloaded", "planning", "Спланируй задачи, проверь документ, сравни варианты, подготовь отчет и составь письмо.", { profile: "planning" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("planning-before", "planning", "Спланируй этапы проекта.", { profile: "planning" }, [0, 45, 90, 100], ["missing-purpose", "missing-criteria", "missing-nextStep"]),
  fixture("planning-after", "planning", "Для команды спланируй этапы проекта [список задач]. Цель: завершить приемку до 31 июля. Расставь приоритеты по сроку и зависимости. Верни план: этап, задача, владелец, срок, риск. При нехватке данных задай уточняющие вопросы, затем передай план на согласование эксперту.", null, [45, 100, 90, 100], [], ["missing-purpose", "missing-criteria", "missing-nextStep"]),

  fixture("comparison-strong", "comparison", "Для руководителя отдела сравни два коммерческих предложения [предложение А, предложение Б]. Сопоставь варианты по стоимости, сроку, гарантии и риску. Верни таблицу с колонками: критерий, вариант А, вариант Б, вывод. Отдельно укажи допущения и следующий шаг для выбора.", null, [50, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-output"]),
  fixture("comparison-weak", "comparison", "Сравни варианты и выбери лучший.", { profile: "comparison" }, [0, 50, 90, 100], ["missing-data", "missing-criteria", "missing-output"]),
  fixture("comparison-short", "comparison", "Сравни варианты.", { profile: "comparison" }, [0, 30, 90, 100], ["missing-data", "missing-criteria"]),
  fixture("comparison-empty-shell", "comparison", "Данные: данные. Критерии: критерии. Формат: формат. Ограничения: ограничения.", { profile: "comparison" }, [0, 25, 90, 100], ["empty-shell"]),
  fixture("comparison-before", "comparison", "Сопоставь предложения поставщиков.", { profile: "comparison" }, [0, 45, 90, 100], ["missing-data", "missing-criteria", "missing-output"]),
  fixture("comparison-after", "comparison", "Для заказчика сопоставь предложения поставщиков [предложение А, предложение Б]. Сравни варианты по стоимости, сроку, условиям гарантии и риску. Верни таблицу: критерий, вариант А, вариант Б, рекомендация. Укажи неопределенности и вопрос для уточнения перед выбором.", null, [45, 100, 90, 100], [], ["missing-data", "missing-criteria", "missing-output"]),

  fixture("extraction-strong", "extraction", "Для отдела извлеки реквизиты и структурируй данные из приложенного договора [текст договора]. Выдели номер, дату, стороны, сумму и срок по каждому разделу. Верни таблицу с колонками: поле, значение, фрагмент источника. Не добавляй отсутствующие значения; при неясном поле укажи «не найдено».", null, [60, 100, 90, 100], [], ["missing-data", "missing-output"]),
  fixture("extraction-weak", "extraction", "Выдели важные поля из документа.", { profile: "extraction" }, [0, 50, 90, 100], ["missing-output"]),
  fixture("extraction-short", "extraction", "Извлеки реквизиты.", { profile: "extraction" }, [0, 30, 90, 100], ["missing-data", "missing-output"]),
  fixture("extraction-overloaded", "extraction", "Извлеки реквизиты, проверь документ, сравни варианты, подготовь отчет и составь письмо.", { profile: "extraction" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("extraction-before", "extraction", "Структурируй данные из договора.", { profile: "extraction" }, [0, 45, 90, 100], ["missing-output"]),
  fixture("extraction-after", "extraction", "Для отдела извлеки реквизиты из договора [текст договора]. Выдели номер, дату, стороны, сумму и срок по каждому разделу. Верни таблицу: поле, значение, фрагмент. Не добавляй отсутствующие факты; при неясности укажи «не найдено».", null, [60, 100, 90, 100], [], ["missing-data", "missing-output"]),

  fixture("report-strong", "report", "Для руководителя подготовь отчет по приложенной таблице показателей [факт, план, отклонение]. Проанализируй данные за квартал и сверь каждый показатель с планом и лимитом. Верни заключение, таблицу отклонений, выводы и рекомендации. Укажи неопределенности, не придумывай факты и передай спорные выводы на ручную проверку.", null, [65, 100, 90, 100], [], ["missing-data", "missing-output", "missing-verification"]),
  fixture("report-weak", "report", "Подготовь отчет по результатам.", { profile: "report" }, [0, 50, 90, 100], ["missing-data", "missing-verification"]),
  fixture("report-short", "report", "Нужен отчет.", { profile: "report" }, [0, 20, 90, 100], ["missing-action", "missing-data"]),
  fixture("report-overloaded", "report", "Подготовь отчет, проверь документ, сравни варианты, составь письмо и рассчитай показатели.", { profile: "report" }, [0, 50, 90, 100], ["task-overload"]),
  fixture("report-before", "report", "Сделай отчет по проверке.", { profile: "report" }, [0, 45, 90, 100], ["missing-data", "missing-output", "missing-verification"]),
  fixture("report-after", "report", "Для руководителя подготовь отчет по проверке [реестр результатов]. Сверь каждую запись с критериями: дата, сумма, срок. Верни заключение, таблицу отклонений, выводы и рекомендации. Укажи неопределенности и передай спорные выводы на ручную проверку.", null, [55, 100, 90, 100], [], ["missing-data", "missing-output", "missing-verification"]),

  fixture("universal-strong", "universal", "Для команды подготовь структурированный список действий по приложенному материалу [описание работы и ограничения]. Цель: согласовать следующее действие к пятнице. Включи владельца, дату, результат и риск для каждого пункта. При нехватке данных задай уточняющий вопрос и не добавляй отсутствующие факты.", null, [60, 100, 90, 100], [], ["missing-action", "missing-purpose", "missing-output"]),
  fixture("universal-weak", "universal", "Помоги с задачей.", null, [0, 30, 90, 100], ["missing-action", "missing-output"]),
  fixture("universal-short", "universal", "Сделай это.", null, [0, 20, 90, 100], ["missing-action", "missing-purpose", "missing-output", "unresolved-reference"]),
  fixture("universal-empty-shell-calibration", "universal", "Роль: роль. Контекст: контекст. Задача: задача. Формат: формат. Ограничения: ограничения.", null, [0, 25, 90, 100], ["empty-shell"]),
  fixture("universal-before", "universal", "Подготовь список по материалу.", null, [0, 45, 90, 100], ["missing-purpose"]),
  fixture("universal-after", "universal", "Для команды подготовь список действий по материалу [описание работы]. Цель: согласовать следующее действие к пятнице. Верни таблицу: действие, владелец, дата, результат. При нехватке данных задай вопрос и не добавляй отсутствующие факты.", null, [45, 100, 90, 100], [], ["missing-action", "missing-purpose", "missing-output"])
];

export default cases;
